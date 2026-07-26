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
    # P2：统计下推到数据库，避免把全表对象拉到 Python 内存中计数
    product_count = await db.scalar(select(func.count(Product.id)).where(Product.merchant_id == merchant_id))
    active_product_count = await db.scalar(
        select(func.count(Product.id)).where(Product.merchant_id == merchant_id, Product.status == ProductStatus.ACTIVE)
    )
    pending_review_count = await db.scalar(
        select(func.count(Product.id)).where(Product.merchant_id == merchant_id, Product.status == ProductStatus.PENDING)
    )
    low_stock_count = await db.scalar(
        select(func.count(Product.id)).where(Product.merchant_id == merchant_id, Product.stock <= 5)
    )
    # 仅统计涉及该商家商品的订单（通过 OrderItem -> Product 关联去重）
    order_count = await db.scalar(
        select(func.count(Order.id.distinct()))
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Product.merchant_id == merchant_id)
    )
    paid_order_count = await db.scalar(
        select(func.count(Order.id.distinct()))
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(
            Product.merchant_id == merchant_id,
            Order.status.notin_([OrderStatus.PENDING_PAYMENT, OrderStatus.REFUNDED]),
        )
    )
    total_sales = await db.scalar(
        select(func.coalesce(func.sum(Order.total_amount), 0))
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Product.merchant_id == merchant_id, Order.status != OrderStatus.REFUNDED)
    )
    return MerchantStats(
        product_count=product_count or 0,
        active_product_count=active_product_count or 0,
        order_count=order_count or 0,
        paid_order_count=paid_order_count or 0,
        total_sales=round(float(total_sales or 0), 2),
        pending_review_count=pending_review_count or 0,
        low_stock_count=low_stock_count or 0,
    )


async def admin_stats(db: AsyncSession) -> AdminStats:
    # P2：聚合下推，避免全表加载
    user_count = await db.scalar(select(func.count(User.id)))
    merchant_count = await db.scalar(select(func.count(User.id)).where(User.role == Role.MERCHANT))
    product_count = await db.scalar(select(func.count(Product.id)))
    pending_product_count = await db.scalar(
        select(func.count(Product.id)).where(Product.status == ProductStatus.PENDING)
    )
    order_count = await db.scalar(select(func.count(Order.id)))
    gmv = await db.scalar(
        select(func.coalesce(func.sum(Order.total_amount), 0)).where(Order.status != OrderStatus.REFUNDED)
    )
    negative_review_count = await db.scalar(
        select(func.count(Review.id)).where(Review.sentiment == Sentiment.NEGATIVE)
    )
    return AdminStats(
        user_count=user_count or 0,
        merchant_count=merchant_count or 0,
        product_count=product_count or 0,
        pending_product_count=pending_product_count or 0,
        order_count=order_count or 0,
        total_gmv=round(float(gmv or 0), 2),
        negative_review_count=negative_review_count or 0,
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
