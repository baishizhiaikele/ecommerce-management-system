from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.variant import VariantCreate, VariantOut, VariantUpdate
from app.services import variant_service

router = APIRouter(prefix="/products", tags=["variants"])


@router.get("/{product_id}/variants", response_model=list[VariantOut])
async def list_variants(product_id: str, db: AsyncSession = Depends(get_db)) -> list[VariantOut]:
    return [VariantOut(**d) for d in await variant_service.list_variants(db, product_id)]


@router.post("/{product_id}/variants", response_model=VariantOut, status_code=201)
async def create_variant(
    product_id: str,
    data: VariantCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> VariantOut:
    return await variant_service.create_variant(
        db, merchant_id=user.id, product_id=product_id, data=data
    )


@router.patch("/variants/{variant_id}", response_model=VariantOut)
async def update_variant(
    variant_id: str,
    data: VariantUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> VariantOut:
    return await variant_service.update_variant(
        db, merchant_id=user.id, variant_id=variant_id, data=data
    )


@router.delete("/variants/{variant_id}")
async def delete_variant(
    variant_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> dict:
    await variant_service.delete_variant(db, merchant_id=user.id, variant_id=variant_id)
    return {"ok": True}
