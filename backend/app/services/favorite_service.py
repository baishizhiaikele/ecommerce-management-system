from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.favorite import Favorite
from app.models.product import Product

from app.core.cache import cache_delete


async def add_favorite(db: AsyncSession, user_id: str, product_id: str) -> Favorite:
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在")
    existing = await db.scalar(
        select(Favorite).where(
            Favorite.user_id == user_id, Favorite.product_id == product_id
        )
    )
    if existing:
        return existing
    fav = Favorite(user_id=user_id, product_id=product_id)
    db.add(fav)
    await db.commit()
    await db.refresh(fav)
    # 收藏会改变用户行为序列 → 立即使其推荐缓存失效，下次请求即按新行为重算
    await cache_delete(f"recommend:{user_id}")
    return fav


async def remove_favorite(db: AsyncSession, user_id: str, product_id: str) -> None:
    fav = await db.scalar(
        select(Favorite).where(
            Favorite.user_id == user_id, Favorite.product_id == product_id
        )
    )
    if fav:
        await db.delete(fav)
        await db.commit()
        # 取消收藏同样改变行为序列 → 失效推荐缓存
        await cache_delete(f"recommend:{user_id}")


async def list_favorites(db: AsyncSession, user_id: str) -> list[Product]:
    stmt = (
        select(Product)
        .join(Favorite, Favorite.product_id == Product.id)
        .where(Favorite.user_id == user_id)
        .order_by(Favorite.created_at.desc())
    )
    return list(await db.scalars(stmt))


async def is_favorited(db: AsyncSession, user_id: str, product_id: str) -> bool:
    fav = await db.scalar(
        select(Favorite.id).where(
            Favorite.user_id == user_id, Favorite.product_id == product_id
        )
    )
    return fav is not None


async def list_user_ids_by_product(db: AsyncSession, product_id: str) -> list[str]:
    """返回收藏了某商品的所有用户 id（用于降价等事件通知）。"""
    rows = await db.scalars(
        select(Favorite.user_id).where(Favorite.product_id == product_id)
    )
    return list(rows)
