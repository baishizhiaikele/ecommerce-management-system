from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.favorite import Favorite
from app.models.product import Product, ProductStatus


async def recommend_for(db: AsyncSession, user_id: str, limit: int = 8) -> list[Product]:
    """个性化推荐：优先推荐用户收藏同类目、且未收藏的商品；不足则用热销补全。"""
    fav_cat_stmt = (
        select(Product.category_id)
        .join(Favorite, Favorite.product_id == Product.id)
        .where(Favorite.user_id == user_id)
        .distinct()
    )
    cats = list(await db.scalars(fav_cat_stmt))

    base = select(Product).where(Product.status == ProductStatus.ACTIVE)
    if cats:
        base = base.where(Product.category_id.in_(cats))
    base = base.where(
        Product.id.notin_(select(Favorite.product_id).where(Favorite.user_id == user_id))
    )
    items = list(await db.scalars(base.order_by(Product.sales_count.desc()).limit(limit)))

    if len(items) < limit:
        extra = list(
            await db.scalars(
                select(Product)
                .where(Product.status == ProductStatus.ACTIVE)
                .order_by(Product.sales_count.desc())
                .limit(limit * 2)
            )
        )
        seen = {i.id for i in items}
        for e in extra:
            if e.id not in seen:
                items.append(e)
                seen.add(e.id)
            if len(items) >= limit:
                break
    return items[:limit]
