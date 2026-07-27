from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import search_service
from app.core.cache import cache_get, cache_set

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/hot", response_model=list[str])
async def hot_keywords(
    limit: int = Query(10, ge=1, le=50), db: AsyncSession = Depends(get_db)
) -> list[str]:
    cached = await cache_get(f"search:hot:{limit}")
    if cached is not None:
        return cached
    result = await search_service.top_keywords(db, limit=limit)
    await cache_set(f"search:hot:{limit}", result, ttl=120)
    return result


@router.post("/record")
async def record_keyword(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)) -> dict:
    await search_service.record_keyword(db, q)
    return {"ok": True}


@router.post("/qa")
async def search_qa(
    question: str = Query(..., min_length=1, description="自然语言搜索问题"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """AI 智能搜索问答：自然语言 → 解析筛选 → 召回商品并生成回答。"""
    return await search_service.search_qa(db, question, user_id=user.id)
