"""库存流水与预警服务。

- 所有库存变动都记录 StockLog（含变动后余额），便于对账与审计。
- 入库/盘点/手动修正由商家在库存管理页操作；销售扣减与取消回补由订单流程写入。
- 库存低于阈值时向商家推送低库存预警通知（幂等：仅在越过阈值边缘时提醒）。
- P0-2 多仓发货：``allocate_warehouse`` 按收货地就近 + 有货优先为单个商品选定发货仓。
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InventoryByWarehouse, StockChangeType, StockLog, Warehouse
from app.models.notification import NotificationType
from app.models.product import Product, ProductStatus
from app.models.variant import ProductVariant
from app.models.user import User
from app.services.notification_service import notify

# 低库存预警阈值（演示项目用全局常量；商品可设置独立的 warning_threshold 覆盖，P2-18）
LOW_STOCK_THRESHOLD = 10

# 各大区中心近似经纬度，用于按收货地就近排序（仅做相对距离比较，精度足够路由）
_REGION_GEO = {
    "华北": (116.41, 39.90),
    "华东": (121.47, 31.23),
    "华南": (113.26, 23.13),
    "华中": (114.30, 30.59),
    "西南": (104.07, 30.67),
    "西北": (108.94, 34.34),
    "东北": (123.43, 41.80),
}


def _haversine(a_lng: float, a_lat: float, b_lng: float, b_lat: float) -> float:
    """近似球面距离（单位：度，不做半径换算，仅用于排序比较）。"""
    return (a_lng - b_lng) ** 2 + (a_lat - b_lat) ** 2


async def allocate_warehouse(
    db: AsyncSession,
    *,
    product_id: str,
    quantity: int,
    ship_region: str | None = None,
) -> str | None:
    """为多仓发货选定发货仓（P0-2）。

    路由优先级：
    1. 有货（quantity>0）的仓库；
    2. 同 region 优先；
    3. 同 region 内或跨区，按收货地与仓库的近似距离升序；
    4. 无同 region 时退回 is_default 仓；
    5. 无分仓库存记录时返回 None（沿用旧 ``product.stock`` 单仓逻辑）。
    """
    rows = await db.scalars(
        select(InventoryByWarehouse)
        .where(InventoryByWarehouse.product_id == product_id)
        .options(selectinload(InventoryByWarehouse.warehouse))
    )
    stocks = [
        (iw.warehouse_id, iw.quantity, iw.warehouse)
        for iw in rows
        if iw.warehouse is not None
    ]
    if not stocks:
        return None

    ship_lng, ship_lat = _REGION_GEO.get(ship_region, (None, None))

    def _sort_key(item):
        wh_id, qty, wh = item
        has_stock = 1 if qty >= quantity else 0  # 有货优先
        region_match = 1 if (ship_region and wh.region == ship_region) else 0
        dist = float("inf")
        if ship_lng is not None and wh.lng and wh.lat:
            try:
                dist = _haversine(ship_lng, ship_lat, float(wh.lng), float(wh.lat))
            except (ValueError, TypeError):
                dist = float("inf")
        is_default = 1 if wh.is_default else 0
        # 优先级（大者优先）：有货 > 同区命中 > 距离近 > 默认仓兜底
        return (has_stock, region_match, -dist, is_default)

    stocks.sort(key=_sort_key, reverse=True)
    return stocks[0][0]


def _threshold(product: Product) -> int:
    """取商品自身的预警阈值，未设置时回退全局阈值。"""
    wt = getattr(product, "warning_threshold", None)
    return wt if (wt is not None and wt > 0) else LOW_STOCK_THRESHOLD


async def _write_log(
    db: AsyncSession,
    *,
    product: Product,
    merchant_id: str,
    change_type: StockChangeType,
    quantity: int,
    operator_id: str | None,
    remark: str | None,
) -> StockLog:
    product.stock += quantity
    if product.stock < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="库存不足，无法扣减")
    log = StockLog(
        product_id=product.id,
        merchant_id=merchant_id,
        change_type=change_type,
        quantity=quantity,
        balance_after=product.stock,
        remark=remark,
        operator_id=operator_id,
    )
    db.add(log)
    # 越过低库存阈值的边缘提醒一次（优先使用商品自身阈值，P2-18）
    if 0 <= product.stock <= _threshold(product) and change_type != StockChangeType.ORDER_CANCEL:
        await notify(
            db,
            product.merchant_id,
            NotificationType.SYSTEM,
            "低库存预警",
            f"商品「{product.name}」当前库存仅剩 {product.stock} 件，请及时补货。",
            product.id,
        )
    return log


async def adjust(
    db: AsyncSession,
    *,
    merchant: User,
    product_id: str,
    quantity: int,
    change_type: StockChangeType,
    remark: str | None,
) -> StockLog:
    if quantity == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="变动数量不能为 0")
    product = await db.get(Product, product_id)
    if not product or product.merchant_id != merchant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在或无权操作")
    if product.status == ProductStatus.DRAFT:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="草稿商品不可调整库存")
    log = await _write_log(
        db,
        product=product,
        merchant_id=merchant.id,
        change_type=change_type,
        quantity=quantity,
        operator_id=merchant.id,
        remark=remark,
    )
    await db.commit()
    await db.refresh(log)
    return log


async def record_sale(db: AsyncSession, product: Product, quantity: int) -> None:
    """订单下单时扣减库存（在订单事务内调用，不单独 commit）。"""
    await _write_log(
        db,
        product=product,
        merchant_id=product.merchant_id,
        change_type=StockChangeType.SALE,
        quantity=-abs(quantity),
        operator_id=None,
        remark="订单销售扣减",
    )


async def record_cancel_return(
    db: AsyncSession, product: Product, quantity: int, *, variant_id: int | None = None
) -> None:
    """订单取消/退款时回补库存（在订单事务内调用，不单独 commit）。

    修复 P0#2：当传入 variant_id 时，同时回补对应 SKU 规格库存，
    避免规格库存只扣不回补导致永久显示售罄。使用行锁防止并发超补。
    """
    await _write_log(
        db,
        product=product,
        merchant_id=product.merchant_id,
        change_type=StockChangeType.ORDER_CANCEL,
        quantity=abs(quantity),
        operator_id=None,
        remark="订单取消回补",
    )
    if variant_id is not None:
        variant = await db.scalar(
            select(ProductVariant)
            .where(ProductVariant.id == variant_id)
            .with_for_update()
        )
        if variant is not None:
            variant.stock = int(variant.stock or 0) + abs(quantity)
            db.add(variant)
            await db.flush()


async def list_logs(
    db: AsyncSession,
    *,
    merchant_id: str,
    product_id: str | None = None,
    limit: int = 100,
) -> list[StockLog]:
    stmt = (
        select(StockLog)
        .where(StockLog.merchant_id == merchant_id)
        .order_by(StockLog.created_at.desc())
    )
    if product_id:
        stmt = stmt.where(StockLog.product_id == product_id)
    stmt = stmt.limit(limit)
    rows = await db.scalars(stmt)
    return list(rows)


async def low_stock_products(db: AsyncSession, *, merchant_id: str) -> list[Product]:
    stmt = (
        select(Product)
        .where(
            Product.merchant_id == merchant_id,
            Product.status == ProductStatus.ACTIVE,
            Product.stock <= func.coalesce(Product.warning_threshold, LOW_STOCK_THRESHOLD),
        )
        .order_by(Product.stock.asc())
    )
    return list(await db.scalars(stmt))


async def summary(db: AsyncSession, *, merchant_id: str) -> dict:
    total = int(
        await db.scalar(
            select(func.count(Product.id)).where(Product.merchant_id == merchant_id)
        )
        or 0
    )
    low = int(
        await db.scalar(
            select(func.count(Product.id)).where(
                Product.merchant_id == merchant_id,
                Product.status == ProductStatus.ACTIVE,
                Product.stock <= LOW_STOCK_THRESHOLD,
            )
        )
        or 0
    )
    out = int(
        await db.scalar(
            select(func.count(Product.id)).where(
                Product.merchant_id == merchant_id,
                Product.status == ProductStatus.ACTIVE,
                Product.stock <= 0,
            )
        )
        or 0
    )
    since = datetime.now(timezone.utc) - timedelta(days=7)
    recent = int(
        await db.scalar(
            select(func.count(StockLog.id)).where(
                StockLog.merchant_id == merchant_id,
                StockLog.created_at >= since,
            )
        )
        or 0
    )
    return {
        "total_skus": total,
        "low_stock_count": low,
        "out_of_stock_count": out,
        "recent_changes": recent,
    }
