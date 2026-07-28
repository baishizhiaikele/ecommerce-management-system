from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.knowledge import KnowledgeCreate, KnowledgeOut, SuggestOut
from app.services import knowledge_service

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("", response_model=list[KnowledgeOut])
async def list_entries(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list[KnowledgeOut]:
    """商家查看知识库（手动 + 自学习）。"""
    return await knowledge_service.list_entries(db, merchant_id=user.id)


@router.post("", response_model=KnowledgeOut, status_code=201)
async def create_entry(
    data: KnowledgeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> KnowledgeOut:
    """商家手动录入 FAQ。"""
    return await knowledge_service.create_manual(
        db, merchant_id=user.id, question=data.question, answer=data.answer
    )


@router.delete("/{entry_id}", status_code=204)
async def delete_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> None:
    await knowledge_service.delete_entry(db, entry_id=entry_id, merchant_id=user.id)


@router.get("/suggest", response_model=list[SuggestOut])
async def suggest(
    merchant_id: str = Query(...),
    q: str = Query(..., min_length=1, max_length=500),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SuggestOut]:
    """买家提问前的知识库命中建议（自助解决）。"""
    hits = await knowledge_service.suggest(db, merchant_id=merchant_id, question=q)
    return [
        SuggestOut(entry_id=e.id, question=e.question, answer=e.answer, score=round(s, 3))
        for e, s in hits
    ]
