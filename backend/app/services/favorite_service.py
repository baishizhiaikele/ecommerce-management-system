from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.favorite import Favorite
from app.models.product import Product


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
