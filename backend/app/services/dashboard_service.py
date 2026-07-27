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
    MerchantAnalytics,
    MerchantStats,
    RFMSegment,
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
                .select_from(Order)
                .join(OrderItem, OrderItem.order_id == Order.id)
                .join(Product, Product.id == OrderItem.product_id)
                .where(*base_where, Product.merchant_id == merchant_id)
            )
            orders = await db.scalar(
                select(func.count(func.distinct(Order.id)))
                .select_from(Order)
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
        **(await _rfm_and_repurchase(db)),
    )


def _buyer_aggregation(merchant_id: str | None = None):
    """构造按买家聚合已支付订单的查询（RFM / 复购率共用）。"""
    stmt = (
        select(
            Order.buyer_id,
            func.count(func.distinct(Order.id)),
            func.coalesce(func.sum(Order.total_amount), 0),
            func.max(Order.created_at),
        )
        .where(Order.status.notin_([OrderStatus.PENDING_PAYMENT, OrderStatus.REFUNDED]))
    )
    if merchant_id:
        stmt = (
            stmt.select_from(Order)
            .join(OrderItem, OrderItem.order_id == Order.id)
            .join(Product, Product.id == OrderItem.product_id)
            .where(Product.merchant_id == merchant_id)
        )
    return stmt.group_by(Order.buyer_id)


async def rfm_analysis(db: AsyncSession, *, merchant_id: str | None = None) -> list[RFMSegment]:
    """RFM 客户分层：按最近购买 / 频次 / 金额把买家归入运营人群。"""
    rows = (await db.execute(_buyer_aggregation(merchant_id))).all()
    # SQLite 存储的 created_at 为 naive，统一用 naive 计算避免时区相减报错
    now = datetime.now()
    buckets = {
        "高价值客户": {"count": 0, "monetary": 0.0},
        "忠诚客户": {"count": 0, "monetary": 0.0},
        "潜力客户": {"count": 0, "monetary": 0.0},
        "新客": {"count": 0, "monetary": 0.0},
        "流失风险": {"count": 0, "monetary": 0.0},
    }
    for _buyer_id, freq, monetary, last in rows:
        monetary = float(monetary or 0)
        recency_days = (now - (last or now)).days
        seg = _classify(recency_days, int(freq or 0), monetary)
        buckets[seg]["count"] += 1
        buckets[seg]["monetary"] += monetary
    return [
        RFMSegment(
            segment=name,
            customers=vals["count"],
            total_monetary=round(vals["monetary"], 2),
        )
        for name, vals in buckets.items()
    ]


def _classify(recency_days: int, frequency: int, monetary: float) -> str:
    if recency_days > 60:
        return "流失风险"
    if frequency == 1:
        return "新客"
    if recency_days <= 30 and frequency >= 2 and monetary >= 100:
        return "高价值客户"
    if monetary >= 100:
        return "潜力客户"
    return "忠诚客户"


async def repurchase_rate(db: AsyncSession, *, merchant_id: str | None = None) -> float:
    """复购率 = 下单≥2 次的买家数 / 下单≥1 次的买家数。"""
    rows = (await db.execute(_buyer_aggregation(merchant_id))).all()
    total = len(rows)
    if total == 0:
        return 0.0
    repeat = sum(1 for _b, freq, _m, _l in rows if int(freq or 0) >= 2)
    return round(repeat / total, 4)


async def _rfm_and_repurchase(db: AsyncSession, *, merchant_id: str | None = None) -> dict:
    rfm = await rfm_analysis(db, merchant_id=merchant_id)
    buyers = sum(seg.customers for seg in rfm)
    return {
        "rfm": rfm,
        "repurchase_rate": await repurchase_rate(db, merchant_id=merchant_id),
        "buyers": buyers,
    }


async def _merchant_top_products(db: AsyncSession, merchant_id: str, limit: int = 5) -> list[TopProduct]:
    stmt = (
        select(
            Product.id,
            Product.name,
            func.coalesce(func.sum(OrderItem.quantity), 0),
            func.coalesce(func.sum(OrderItem.quantity * Product.price), 0),
        )
        .select_from(OrderItem)
        .join(Product, Product.id == OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Product.merchant_id == merchant_id,
            Order.status.notin_([OrderStatus.PENDING_PAYMENT, OrderStatus.REFUNDED]),
        )
        .group_by(Product.id, Product.name)
        .order_by(func.coalesce(func.sum(OrderItem.quantity * Product.price), 0).desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        TopProduct(
            id=pid,
            name=nm or "未命名商品",
            sales=int(s or 0),
            revenue=round(float(rev or 0), 2),
        )
        for pid, nm, s, rev in rows
    ]


async def merchant_analytics(db: AsyncSession, merchant_id: str) -> MerchantAnalytics:
    """商家视角分析：RFM 分层、复购率、销售趋势、Top 商品。"""
    stats = await merchant_stats(db, merchant_id)
    rfm = await rfm_analysis(db, merchant_id=merchant_id)
    buyers = sum(seg.customers for seg in rfm)
    return MerchantAnalytics(
        stats=stats,
        rfm=rfm,
        repurchase_rate=await repurchase_rate(db, merchant_id=merchant_id),
        buyers=buyers,
        sales_trend=await sales_trend(db, merchant_id=merchant_id, days=7),
        top_products=await _merchant_top_products(db, merchant_id),
    )
