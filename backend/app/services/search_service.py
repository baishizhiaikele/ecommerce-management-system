from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.search import SearchKeyword


async def record_keyword(db: AsyncSession, raw: str) -> None:
    kw = (raw or "").strip()
    if len(kw) < 2:
        return
    obj = await db.get(SearchKeyword, kw)
    if obj:
        obj.count += 1
    else:
        obj = SearchKeyword(keyword=kw, count=1)
        db.add(obj)
    await db.commit()


async def top_keywords(db: AsyncSession, *, limit: int = 10) -> list[str]:
    rows = await db.scalars(
        select(SearchKeyword)
        .order_by(SearchKeyword.count.desc(), SearchKeyword.last_searched.desc())
        .limit(limit)
    )
    return [r.keyword for r in rows]
