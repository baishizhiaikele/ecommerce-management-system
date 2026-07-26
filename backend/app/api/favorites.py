from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.product import Product
from app.models.user import User
from app.schemas.product import ProductOut
from app.services import favorite_service

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("", response_model=list[ProductOut])
async def list_favorites(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list:
    products = await favorite_service.list_favorites(db, user.id)
    return [ProductOut.model_validate(p) for p in products]


@router.post("/{product_id}", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
async def add_favorite(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProductOut:
    fav = await favorite_service.add_favorite(db, user.id, product_id)
    product = await db.get(Product, fav.product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在")
    return ProductOut.model_validate(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await favorite_service.remove_favorite(db, user.id, product_id)


@router.get("/{product_id}/is-favorited", response_model=dict)
async def is_favorited(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    return {"favorited": await favorite_service.is_favorited(db, user.id, product_id)}
