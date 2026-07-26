from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.catalog import Category
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product, ProductStatus
from app.models.review import Review, Sentiment
from app.models.user import Role, User
from app.schemas.dashboard import (
    AdminStats,
    CategoryBreakdown,
    Comparison,
    DashboardAnalytics,
    FunnelStage,
    MerchantStats,
    TopProduct,
)


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
        base_where = [
            Order.created_at >= start,
            Order.created_at < end,
            Order.status != OrderStatus.REFUNDED,
        ]
        if merchant_id:
            amount = await db.scalar(
                select(func.coalesce(func.sum(OrderItem.price * OrderItem.quantity), 0))
                .join(OrderItem, OrderItem.order_id == Order.id)
                .join(Product, Product.id == OrderItem.product_id)
                .where(*base_where, Product.merchant_id == merchant_id)
            )
            orders = await db.scalar(
                select(func.count(func.distinct(Order.id)))
                .join(OrderItem, OrderItem.order_id == Order.id)
                .join(Product, Product.id == OrderItem.product_id)
                .where(*base_where, Product.merchant_id == merchant_id)
            )
        else:
            amount = await db.scalar(
                select(func.coalesce(func.sum(Order.total_amount), 0)).where(*base_where)
            )
            orders = await db.scalar(
                select(func.count(Order.id)).where(*base_where)
            )
        points.append(
            TrendPoint(
                date=day.strftime("%m-%d"),
                amount=Decimal(str(amount or 0)),
                orders=int(orders or 0),
            )
        )
    return points


async def dashboard_analytics(db: AsyncSession) -> DashboardAnalytics:
    """仪表板深度分析：品类占比、Top 商品、转化漏斗、环比。"""
    # 品类销量 / 销售额占比（基于真实成交 OrderItem 聚合）
    cat_stmt = (
        select(
            Category.id,
            Category.name,
            func.count(func.distinct(Product.id)),
            func.coalesce(func.sum(OrderItem.quantity), 0),
            func.coalesce(func.sum(OrderItem.quantity * Product.price), 0),
        )
        .select_from(OrderItem)
        .join(Product, Product.id == OrderItem.product_id)
        .outerjoin(Category, Category.id == Product.category_id)
        .group_by(Category.id, Category.name)
        .order_by(func.coalesce(func.sum(OrderItem.quantity * Product.price), 0).desc())
    )
    cat_rows = (await db.execute(cat_stmt)).all()
    category_breakdown: list[CategoryBreakdown] = []
    for cid, cname, cnt, sales, revenue in cat_rows:
        category_breakdown.append(
            CategoryBreakdown(
                category_id=cid,
                category=cname or "未分类",
                products=int(cnt or 0),
                sales=int(sales or 0),
                revenue=round(float(revenue or 0), 2),
            )
        )
    if not category_breakdown:
        category_breakdown.append(
            CategoryBreakdown(category_id=None, category="未分类", products=0, sales=0, revenue=0.0)
        )

    # Top 5 商品（按真实成交销售额）
    top_stmt = (
        select(
            Product.id,
            Product.name,
            func.coalesce(func.sum(OrderItem.quantity), 0),
            func.coalesce(func.sum(OrderItem.quantity * Product.price), 0),
        )
        .select_from(OrderItem)
        .join(Product, Product.id == OrderItem.product_id)
        .group_by(Product.id, Product.name)
        .order_by(func.coalesce(func.sum(OrderItem.quantity * Product.price), 0).desc())
        .limit(5)
    )
    top_rows = (await db.execute(top_stmt)).all()
    top_products = [
        TopProduct(
            id=pid,
            name=nm or "未命名商品",
            sales=int(s or 0),
            revenue=round(float(rev or 0), 2),
        )
        for pid, nm, s, rev in top_rows
    ]

    # 转化漏斗（基于订单状态近似）
    total_orders = await db.scalar(select(func.count(Order.id))) or 0
    paid = (
        await db.scalar(
            select(func.count(Order.id)).where(
                Order.status.notin_([OrderStatus.PENDING_PAYMENT, OrderStatus.REFUNDED])
            )
        )
        or 0
    )
    shipped = (
        await db.scalar(
            select(func.count(Order.id)).where(
                Order.status.in_([OrderStatus.SHIPPED, OrderStatus.COMPLETED])
            )
        )
        or 0
    )
    completed = (
        await db.scalar(
            select(func.count(Order.id)).where(Order.status == OrderStatus.COMPLETED)
        )
        or 0
    )
    funnel = [
        FunnelStage(stage="下单", value=int(total_orders)),
        FunnelStage(stage="支付", value=int(paid)),
        FunnelStage(stage="发货", value=int(shipped)),
        FunnelStage(stage="完成", value=int(completed)),
    ]

    # 环比：近 7 天 vs 前 7 天
    today = datetime.now(timezone.utc).date()
    start_now = datetime(today.year, today.month, today.day, tzinfo=timezone.utc) - timedelta(days=6)
    start_prev = start_now - timedelta(days=7)
    gmv_now = (
        await db.scalar(
            select(func.coalesce(func.sum(Order.total_amount), 0)).where(
                Order.created_at >= start_now, Order.status != OrderStatus.REFUNDED
            )
        )
        or 0
    )
    gmv_prev = (
        await db.scalar(
            select(func.coalesce(func.sum(Order.total_amount), 0)).where(
                Order.created_at >= start_prev,
                Order.created_at < start_now,
                Order.status != OrderStatus.REFUNDED,
            )
        )
        or 0
    )
    orders_now = (
        await db.scalar(select(func.count(Order.id)).where(Order.created_at >= start_now)) or 0
    )
    orders_prev = (
        await db.scalar(
            select(func.count(Order.id)).where(
                Order.created_at >= start_prev, Order.created_at < start_now
            )
        )
        or 0
    )
    gmv_rate = (float(gmv_now) - float(gmv_prev)) / float(gmv_prev) if float(gmv_prev) else 0.0
    orders_rate = (int(orders_now) - int(orders_prev)) / int(orders_prev) if int(orders_prev) else 0.0
    comparison = Comparison(
        gmv_now=round(float(gmv_now), 2),
        gmv_prev=round(float(gmv_prev), 2),
        gmv_rate=round(float(gmv_rate), 4),
        orders_now=int(orders_now),
        orders_prev=int(orders_prev),
        orders_rate=round(float(orders_rate), 4),
    )

    return DashboardAnalytics(
        category_breakdown=category_breakdown,
        top_products=top_products,
        funnel=funnel,
        comparison=comparison,
    )
