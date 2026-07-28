"""个性化推荐（v4 升级：实时行为序列）。

信号融合（类目打分）：
- 最近浏览序列（ProductView，最近 20 条，时间越近权重越高，1.0 → 0.05 线性衰减）
- 收藏（Favorite，每条 +2.0）
- 近期购买（OrderItem，最近 10 条，每条 +3.0）

召回策略：按类目得分从高到低取商品（热销排序），排除已收藏与近期已购商品；
不足时用全站热销补全。无任何行为时退化为热销榜。
"""

from sqlalchemy import select
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
    """实时行为序列个性化推荐。"""
    scores = await _category_scores(db, user_id)

    # 排除项：已收藏、近期已购
    fav_ids = select(Favorite.product_id).where(Favorite.user_id == user_id)
    bought_ids = (
        select(OrderItem.product_id)
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.buyer_id == user_id)
    )

    items: list[Product] = []
    seen: set[str] = set()

    if scores:
        # 按类目得分从高到低依次召回
        ranked_cats = sorted(scores, key=lambda c: scores[c], reverse=True)
        for cat in ranked_cats:
            if len(items) >= limit:
                break
            rows = list(
                await db.scalars(
                    select(Product)
                    .where(
                        Product.status == ProductStatus.ACTIVE,
                        Product.category_id == cat,
                        Product.id.notin_(fav_ids),
                        Product.id.notin_(bought_ids),
                    )
                    .order_by(Product.sales_count.desc())
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
        extra = list(
            await db.scalars(
                select(Product)
                .where(Product.status == ProductStatus.ACTIVE)
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
