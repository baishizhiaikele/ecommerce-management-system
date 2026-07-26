from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db.session import get_db
from app.models.order import Order, OrderItem
from app.models.product import Product, ProductStatus
from app.models.user import Role, User
from app.schemas.dashboard import MerchantStats, TrendPoint
from app.schemas.product import ProductOut
import csv
import io

from app.services import dashboard_service

router = APIRouter(prefix="/merchant", tags=["merchant"])


@router.get("/reports/orders")
async def export_orders(
    db: AsyncSession = Depends(get_db), user: User = Depends(require_role(Role.MERCHANT))
) -> StreamingResponse:
    """导出商家相关订单为 CSV（含 UTF-8 BOM，Excel 可直接打开）。"""
    order_ids = await db.scalars(
        select(OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Product.merchant_id == user.id)
        .distinct()
    )
    ids = list(order_ids)
    orders = []
    if ids:
        orders = list(
            await db.scalars(
                select(Order).where(Order.id.in_(ids)).order_by(Order.created_at.desc())
            )
        )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["订单号", "下单时间", "状态", "金额", "优惠", "收货地址"])
    for o in orders:
        writer.writerow(
            [
                o.order_no,
                o.created_at.strftime("%Y-%m-%d %H:%M"),
                o.status.value,
                float(o.total_amount),
                float(o.discount_amount),
                o.address or "",
            ]
        )
    content = "\ufeff" + buf.getvalue()
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"},
    )


@router.get("/dashboard/stats", response_model=MerchantStats)
async def stats(
    db: AsyncSession = Depends(get_db), user: User = Depends(require_role(Role.MERCHANT))
) -> MerchantStats:
    return await dashboard_service.merchant_stats(db, user.id)


@router.get("/dashboard/trend", response_model=list[TrendPoint])
async def trend(
    days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list[TrendPoint]:
    return await dashboard_service.sales_trend(db, merchant_id=user.id, days=days)


@router.get("/products", response_model=list[ProductOut])
async def my_products(
    db: AsyncSession = Depends(get_db), user: User = Depends(require_role(Role.MERCHANT))
) -> list[ProductOut]:
    rows = await db.scalars(
        select(Product).where(Product.merchant_id == user.id).order_by(Product.created_at.desc())
    )
    return list(rows)
