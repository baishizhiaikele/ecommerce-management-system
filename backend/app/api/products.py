from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.product import Product, ProductStatus
from app.models.user import Role, User
from app.schemas.product import (
    AIGenerateRequest,
    AIGenerateResult,
    ProductCreate,
    ProductOut,
    ProductStatusUpdate,
    ProductUpdate,
)
from app.services import product_service

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
async def list_products(
    db: AsyncSession = Depends(get_db),
    category_id: str | None = None,
    keyword: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> list[Product]:
    items, _ = await product_service.list_products(
        db, category_id=category_id, keyword=keyword, page=page, page_size=page_size
    )
    return items


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)) -> Product:
    return await product_service.get_product(db, product_id)


@router.post("", response_model=ProductOut, status_code=201)
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> Product:
    return await product_service.create_product(db, merchant_id=user.id, data=data)


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    product_id: str,
    data: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> Product:
    product = await product_service.get_product(db, product_id)
    return await product_service.update_product(
        db, product=product, merchant_id=user.id, data=data
    )


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> None:
    product = await product_service.get_product(db, product_id)
    await product_service.delete_product(db, product=product, merchant_id=user.id)


@router.post("/{product_id}/ai-generate", response_model=AIGenerateResult)
async def ai_generate(
    product_id: str,
    data: AIGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> dict:
    product = await product_service.get_product(db, product_id)
    return await product_service.ai_generate(
        db, product=product, merchant_id=user.id, note=data.note
    )


@router.patch("/{product_id}/status", response_model=ProductOut)
async def set_status(
    product_id: str,
    data: ProductStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.ADMIN)),
) -> Product:
    product = await product_service.get_product(db, product_id)
    return await product_service.set_status(db, product=product, admin_id=user.id, data=data)
