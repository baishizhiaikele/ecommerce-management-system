from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db.session import get_db
from app.models.product import Product, ProductStatus
from app.models.user import Role, User
from app.schemas.dashboard import MerchantStats, TrendPoint
from app.schemas.product import ProductOut
from app.services import dashboard_service

router = APIRouter(prefix="/merchant", tags=["merchant"])


@router.get("/dashboard/stats", response_model=MerchantStats)
async def stats(
    db: AsyncSession = Depends(get_db), user: User = Depends(require_role(Role.MERCHANT))
) -> MerchantStats:
    return await dashboard_service.merchant_stats(db, user.id)


@router.get("/dashboard/trend", response_model=list[TrendPoint])
async def trend(
    days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list[TrendPoint]:
    return await dashboard_service.sales_trend(db, merchant_id=user.id, days=days)


@router.get("/products", response_model=list[ProductOut])
async def my_products(
    db: AsyncSession = Depends(get_db), user: User = Depends(require_role(Role.MERCHANT))
) -> list[ProductOut]:
    rows = await db.scalars(
        select(Product).where(Product.merchant_id == user.id).order_by(Product.created_at.desc())
    )
    return list(rows)
