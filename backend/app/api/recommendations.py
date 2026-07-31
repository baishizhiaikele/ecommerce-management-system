from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, cache_set
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.product import ProductOut
from app.services import recommendation_service

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


# 推荐结果基于用户近期行为，变化不频繁；缓存 120s 避免重复重算（行为侧仍有实时性余量）
RECOMMEND_TTL = 120


@router.get("", response_model=list[ProductOut])
async def recommend(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list:
    cache_key = f"recommend:{user.id}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    items = await recommendation_service.recommend_for(db, user.id)
    # ORM 对象在请求间不可复用，按响应模型序列化为 dict 缓存
    cached = [ProductOut.model_validate(it).model_dump() for it in items]
    await cache_set(cache_key, cached, ttl=RECOMMEND_TTL)
    return cached
