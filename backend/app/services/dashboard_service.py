from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product, ProductStatus
from app.models.review import Review, Sentiment
from app.models.user import Role, User
from app.schemas.dashboard import AdminStats, MerchantStats


async def merchant_stats(db: AsyncSession, merchant_id: str) -> MerchantStats:
    products = list(
        await db.scalars(select(Product).where(Product.merchant_id == merchant_id))
    )
    product_ids = {p.id for p in products}
    items = list(
        await db.scalars(select(OrderItem).where(OrderItem.product_id.in_(product_ids)))
    ) if product_ids else []
    order_ids = {it.order_id for it in items}
    orders = list(await db.scalars(select(Order).where(Order.id.in_(order_ids)))) if order_ids else []
    total_sales = sum(
        float(o.total_amount) for o in orders if o.status in (OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.COMPLETED)
    )
    return MerchantStats(
        product_count=len(products),
        active_product_count=sum(1 for p in products if p.status == ProductStatus.ACTIVE),
        order_count=len(orders),
        paid_order_count=sum(1 for o in orders if o.status != OrderStatus.PENDING_PAYMENT and o.status != OrderStatus.REFUNDED),
        total_sales=round(total_sales, 2),
        pending_review_count=sum(1 for p in products if p.status == ProductStatus.PENDING),
        low_stock_count=sum(1 for p in products if p.stock <= 5),
    )


async def admin_stats(db: AsyncSession) -> AdminStats:
    users = list(await db.scalars(select(User)))
    products = list(await db.scalars(select(Product)))
    orders = list(await db.scalars(select(Order)))
    negative = list(await db.scalars(select(Review).where(Review.sentiment == Sentiment.NEGATIVE)))
    gmv = sum(float(o.total_amount) for o in orders if o.status != OrderStatus.REFUNDED)
    return AdminStats(
        user_count=len(users),
        merchant_count=sum(1 for u in users if u.role == Role.MERCHANT),
        product_count=len(products),
        pending_product_count=sum(1 for p in products if p.status == ProductStatus.PENDING),
        order_count=len(orders),
        total_gmv=round(gmv, 2),
        negative_review_count=len(negative),
    )


async def sales_trend(db: AsyncSession, *, merchant_id: str | None = None, days: int = 7) -> list:
    from app.schemas.dashboard import TrendPoint

    today = datetime.now(timezone.utc).date()
    points = []
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        stmt = select(func.coalesce(func.sum(Order.total_amount), 0)).where(
            Order.created_at >= start, Order.created_at < end,
            Order.status != OrderStatus.REFUNDED,
        )
        if merchant_id:
            stmt = stmt.join(OrderItem, OrderItem.order_id == Order.id).join(
                Product, Product.id == OrderItem.product_id
            ).where(Product.merchant_id == merchant_id)
        amount = await db.scalar(stmt)
        points.append(TrendPoint(date=day.strftime("%m-%d"), amount=Decimal(str(amount or 0))))
    return points
