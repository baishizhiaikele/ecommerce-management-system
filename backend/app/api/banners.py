from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, cache_set
from app.db.session import get_db
from app.models.content import Banner
from app.schemas.content import BannerOut

router = APIRouter(prefix="/banners", tags=["banners"])

_BANNERS_TTL = 120  # 高频只读：缓存 2 分钟（T25）


@router.get("", response_model=list[BannerOut])
async def list_banners(request: Request, db: AsyncSession = Depends(get_db)) -> list:
    """首页轮播运营位（公开）。

    命中请求级缓存（per-request）或 Redis/进程内缓存，降低对只读库的重复查询（T25）。
    """
    # 同一请求内多次调用复用（如首页聚合）
    cached = getattr(request.state, "banners_cache", None)
    if cached is not None:
        return cached

    payload = await cache_get("banners:active")
    if payload is not None:
        request.state.banners_cache = payload
        return payload

    rows = await db.scalars(
        select(Banner)
        .where(Banner.is_active == 1)
        .order_by(Banner.sort_order, Banner.created_at)
    )
    payload = [BannerOut.model_validate(r).model_dump() for r in rows]
    await cache_set("banners:active", payload, ttl=_BANNERS_TTL)
    request.state.banners_cache = payload
    return payload
