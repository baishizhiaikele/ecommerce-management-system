from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_get, cache_set
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.product import Product
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


@router.get("/similar/{product_id}", response_model=list[ProductOut])
async def similar(
    product_id: str,
    kind: str = Query("co_purchase", pattern="^(co_purchase|also_viewed)$"),
    limit: int = Query(8, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list:
    """T11 关联推荐：搭配购买（co_purchase）/ 看了又看（also_viewed）。

    基于订单/浏览共现的 item-item 协同过滤，结果变化不频繁，缓存 300s。
    """
    product = await db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="商品不存在")
    cache_key = f"similar:{kind}:{product_id}:{limit}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    if kind == "also_viewed":
        items = await recommendation_service.also_viewed(db, product_id, limit)
    else:
        items = await recommendation_service.co_purchase(db, product_id, limit)
    cached = [ProductOut.model_validate(it).model_dump() for it in items]
    await cache_set(cache_key, cached, ttl=300)
    return cached


@router.get("/collaborative", response_model=list[ProductOut])
async def collaborative(
    limit: int = Query(8, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list:
    """T11 升级：user-user 协同过滤推荐。

    找到行为最相似的 Top-N 用户，聚合他们的偏好商品，排除已接触过的。
    冷启动（无相似用户）时回退到信号融合推荐。
    """
    cache_key = f"collab_rec:{user.id}:{limit}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    items = await recommendation_service.recommend_from_similar_users(db, user.id, limit)
    cached = [ProductOut.model_validate(it).model_dump() for it in items]
    await cache_set(cache_key, cached, ttl=120)
    return cached
