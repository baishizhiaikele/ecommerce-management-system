from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.content import Banner
from app.schemas.content import BannerOut

router = APIRouter(prefix="/banners", tags=["banners"])


@router.get("", response_model=list[BannerOut])
async def list_banners(db: AsyncSession = Depends(get_db)) -> list:
    """首页轮播运营位（公开）。"""
    rows = await db.scalars(
        select(Banner)
        .where(Banner.is_active == 1)
        .order_by(Banner.sort_order, Banner.created_at)
    )
    return list(rows)
