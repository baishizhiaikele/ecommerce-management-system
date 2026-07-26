"""库存流水与预警服务。

- 所有库存变动都记录 StockLog（含变动后余额），便于对账与审计。
- 入库/盘点/手动修正由商家在库存管理页操作；销售扣减与取消回补由订单流程写入。
- 库存低于阈值时向商家推送低库存预警通知（幂等：仅在越过阈值边缘时提醒）。
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import StockChangeType, StockLog
from app.models.notification import NotificationType
from app.models.product import Product, ProductStatus
from app.models.user import User
from app.services.notification_service import notify

# 低库存预警阈值（演示项目用全局常量，避免给已存在的 products 表加列引发迁移）
LOW_STOCK_THRESHOLD = 10


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
    # 越过低库存阈值的边缘提醒一次
    if 0 <= product.stock <= LOW_STOCK_THRESHOLD and change_type != StockChangeType.ORDER_CANCEL:
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


async def record_cancel_return(db: AsyncSession, product: Product, quantity: int) -> None:
    """订单取消/退款时回补库存（在订单事务内调用，不单独 commit）。"""
    await _write_log(
        db,
        product=product,
        merchant_id=product.merchant_id,
        change_type=StockChangeType.ORDER_CANCEL,
        quantity=abs(quantity),
        operator_id=None,
        remark="订单取消回补",
    )


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
            Product.stock <= LOW_STOCK_THRESHOLD,
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
