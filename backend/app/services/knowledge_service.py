"""智能客服知识库自学习服务。

- learn_from_ticket：工单关闭时，提取买家首问与商家最新回答沉淀为 learned 条目（去重）。
- suggest：对买家问题做轻量关键词匹配（字符 bigram 重合度），命中则返回答案建议。
- manual CRUD：商家维护 FAQ。
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KnowledgeEntry
from app.models.support import SenderRole, SupportTicket


def _bigrams(text: str) -> set[str]:
    t = "".join(text.lower().split())
    if len(t) < 2:
        return {t} if t else set()
    return {t[i : i + 2] for i in range(len(t) - 1)}


def _similarity(a: str, b: str) -> float:
    ba, bb = _bigrams(a), _bigrams(b)
    if not ba or not bb:
        return 0.0
    return len(ba & bb) / len(ba | bb)


async def learn_from_ticket(
    db: AsyncSession, ticket: SupportTicket, *, commit: bool = False
) -> KnowledgeEntry | None:
    """工单关闭时自动沉淀 FAQ：买家首问 → 商家最新回答。"""
    question = None
    answer = None
    for m in ticket.messages:
        if m.sender_role == SenderRole.BUYER and question is None:
            question = m.content
        if m.sender_role == SenderRole.MERCHANT:
            answer = m.content  # 取最新一条商家回答
    if not question or not answer:
        return None
    # 去重：同商家已有高度相似问题则跳过
    existing = await db.scalars(
        select(KnowledgeEntry).where(KnowledgeEntry.merchant_id == ticket.merchant_id)
    )
    for e in existing:
        if _similarity(e.question, question) >= 0.6:
            return None
    entry = KnowledgeEntry(
        merchant_id=ticket.merchant_id,
        question=question,
        answer=answer,
        source="learned",
        source_ticket_id=ticket.id,
    )
    db.add(entry)
    if commit:
        await db.commit()
        await db.refresh(entry)
    return entry


async def suggest(
    db: AsyncSession, *, merchant_id: str, question: str, threshold: float = 0.25, limit: int = 3
) -> list[tuple[KnowledgeEntry, float]]:
    """按相似度返回命中的知识条目（降序），并累计命中次数。"""
    entries = list(
        await db.scalars(
            select(KnowledgeEntry).where(KnowledgeEntry.merchant_id == merchant_id)
        )
    )
    scored = [(e, _similarity(e.question, question)) for e in entries]
    hits = sorted(
        [(e, s) for e, s in scored if s >= threshold], key=lambda x: x[1], reverse=True
    )[:limit]
    for e, _ in hits:
        e.hit_count = (e.hit_count or 0) + 1
    if hits:
        await db.commit()
    return hits


async def create_manual(
    db: AsyncSession, *, merchant_id: str, question: str, answer: str
) -> KnowledgeEntry:
    entry = KnowledgeEntry(
        merchant_id=merchant_id, question=question, answer=answer, source="manual"
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


async def list_entries(db: AsyncSession, *, merchant_id: str) -> list[KnowledgeEntry]:
    rows = await db.scalars(
        select(KnowledgeEntry)
        .where(KnowledgeEntry.merchant_id == merchant_id)
        .order_by(KnowledgeEntry.created_at.desc())
    )
    return list(rows)


async def delete_entry(db: AsyncSession, *, entry_id: str, merchant_id: str) -> None:
    entry = await db.get(KnowledgeEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="条目不存在")
    if entry.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除")
    await db.delete(entry)
    await db.commit()
