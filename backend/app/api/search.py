from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services import search_service

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/hot", response_model=list[str])
async def hot_keywords(
    limit: int = Query(10, ge=1, le=50), db: AsyncSession = Depends(get_db)
) -> list[str]:
    return await search_service.top_keywords(db, limit=limit)


@router.post("/record")
async def record_keyword(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)) -> dict:
    await search_service.record_keyword(db, q)
    return {"ok": True}
