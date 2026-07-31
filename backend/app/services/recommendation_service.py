""".

信号融合（类目打分）：
- 最近浏览序列（ProductView，最近 20 条，时间越近权重越高，1.0 → 0.05 线性衰减）
- 收藏（Favorite，每条 +2.0）
- 近期购买（OrderItem，最近 10 条，每条 +3.0）

召回策略：按类目得分从高到低取商品（热销排序），排除已收藏与近期已购商品；
不足时用全站热销补全。无任何行为时退化为热销榜。

性能优化（v6）：
- 原实现按类目循环，每个类目各发一次独立 SQL（N+1），类目多时 DB 往返随类目数线性增长。
- 现改为 **单条查询 + CASE 排序**：用 category→rank 映射构造排序键，
  按 (类目优先级, 销量) 取前 limit 条，结果与原循环完全一致，DB 往返恒为 1 次。
"""

from sqlalchemy import case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.favorite import Favorite
from app.models.order import Order, OrderItem
from app.models.product import Product, ProductStatus
from app.models.view import ProductView

VIEW_SEQ_LEN = 20
BUY_SEQ_LEN = 10
FAV_WEIGHT = 2.0
BUY_WEIGHT = 3.0


async def _category_scores(db: AsyncSession, user_id: str) -> dict[str, float]:
    """融合三路行为信号，输出类目→得分。"""
    scores: dict[str, float] = {}

    # 1) 最近浏览序列：越新权重越高
    view_rows = list(
        await db.execute(
            select(Product.category_id)
            .join(ProductView, ProductView.product_id == Product.id)
            .where(ProductView.user_id == user_id, Product.category_id.isnot(None))
            .order_by(ProductView.created_at.desc())
            .limit(VIEW_SEQ_LEN)
        )
    )
    n = len(view_rows)
    for i, (cat,) in enumerate(view_rows):
        # 最新一条 1.0，线性衰减到约 0.05
        w = 1.0 - (i / max(n, 1)) * 0.95
        scores[cat] = scores.get(cat, 0.0) + w

    # 2) 收藏
    fav_rows = list(
        await db.execute(
            select(Product.category_id)
            .join(Favorite, Favorite.product_id == Product.id)
            .where(Favorite.user_id == user_id, Product.category_id.isnot(None))
        )
    )
    for (cat,) in fav_rows:
        scores[cat] = scores.get(cat, 0.0) + FAV_WEIGHT

    # 3) 近期购买
    buy_rows = list(
        await db.execute(
            select(Product.category_id)
            .join(OrderItem, OrderItem.product_id == Product.id)
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.buyer_id == user_id, Product.category_id.isnot(None))
            .order_by(Order.created_at.desc())
            .limit(BUY_SEQ_LEN)
        )
    )
    for (cat,) in buy_rows:
        scores[cat] = scores.get(cat, 0.0) + BUY_WEIGHT

    return scores


async def recommend_for(db: AsyncSession, user_id: str, limit: int = 8) -> list[Product]:
    """实时行为序列个性化推荐。

    召回逻辑：高分优先类目中的热销商品排在前；单条查询完成（见上方性能说明）。
    """
    scores = await _category_scores(db, user_id)

    # 排除项：已收藏、近期已购（作为子查询在 WHERE 中复用）
    fav_ids = select(Favorite.product_id).where(Favorite.user_id == user_id)
    bought_ids = (
        select(OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.buyer_id == user_id)
    )

    items: list[Product] = []
    seen: set[str] = set()

    if scores:
        # 类目按得分降序，rank=0 为最高优先级；用 CASE 映射为排序键
        ranked_cats = sorted(scores, key=lambda c: scores[c], reverse=True)
        cat_rank = {cat: i for i, cat in enumerate(ranked_cats)}
        # 注意：case(dict) 在 SQLAlchemy 中若省略 value，会把 dict 的 key 当作布尔条件
        # （字符串恒真），导致排序全部命中第一个 WHEN。必须显式传 value=比较列。
        order_case = case(cat_rank, value=Product.category_id)

        rows = list(
            await db.scalars(
                select(Product)
                .where(
                    Product.status == ProductStatus.ACTIVE,
                    Product.category_id.in_(ranked_cats),
                    Product.id.notin_(fav_ids),
                    Product.id.notin_(bought_ids),
                )
                .order_by(order_case.asc(), Product.sales_count.desc())
                .limit(limit)
            )
        )
        for p in rows:
            if p.id not in seen:
                items.append(p)
                seen.add(p.id)
            if len(items) >= limit:
                break

    # 热销补全 / 冷启动兜底
    if len(items) < limit:
        conditions = [
            Product.status == ProductStatus.ACTIVE,
            Product.id.notin_(fav_ids),
            Product.id.notin_(bought_ids),
        ]
        # seen 为空时 NOT IN () 在 SQLite 下恒假，会返回空结果（冷启动拿不到兜底）
        if seen:
            conditions.append(Product.id.notin_(list(seen)))
        extra = list(
            await db.scalars(
                select(Product)
                .where(*conditions)
                .order_by(Product.sales_count.desc())
                .limit(limit * 2)
            )
        )
        for e in extra:
            if e.id not in seen:
                items.append(e)
                seen.add(e.id)
            if len(items) >= limit:
                break
    return items[:limit]
