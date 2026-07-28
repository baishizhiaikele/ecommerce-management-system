from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.qna import ProductAnswer, ProductQuestion
from app.models.user import User
from app.schemas.qna import AnswerOut, QuestionOut
from app.services.audit_service import record

_Q_OPTIONS = [selectinload(ProductQuestion.answers)]


async def _attach_usernames(db: AsyncSession, q: ProductQuestion) -> None:
    # q.answers 已通过 selectinload 预加载，不会触发额外 IO
    user_ids = {q.user_id, *(a.user_id for a in q.answers)}
    if user_ids:
        names = dict(
            (await db.execute(select(User.id, User.username).where(User.id.in_(user_ids)))).all()
        )
        q.username = names.get(q.user_id)  # type: ignore[attr-defined]
        for a in q.answers:
            a.username = names.get(a.user_id)  # type: ignore[attr-defined]


def _to_out(q: ProductQuestion) -> QuestionOut:
    """将 ORM 对象转为纯 Pydantic，避免响应序列化时触发 lazy-load。"""
    return QuestionOut(
        id=q.id,
        product_id=q.product_id,
        user_id=q.user_id,
        username=getattr(q, "username", None),
        content=q.content,
        created_at=q.created_at,
        answers=[
            AnswerOut(
                id=a.id,
                question_id=a.question_id,
                user_id=a.user_id,
                username=getattr(a, "username", None),
                content=a.content,
                is_accepted=bool(a.is_accepted),
                created_at=a.created_at,
            )
            for a in q.answers
        ],
    )


async def _load(db: AsyncSession, question_id: str) -> ProductQuestion | None:
    q = (
        await db.scalars(
            select(ProductQuestion)
            .options(*_Q_OPTIONS)
            .where(ProductQuestion.id == question_id)
        )
    ).first()
    if q:
        await _attach_usernames(db, q)
    return q


async def list_questions(db: AsyncSession, product_id: str) -> list[QuestionOut]:
    rows = list(
        await db.scalars(
            select(ProductQuestion)
            .options(*_Q_OPTIONS)
            .where(ProductQuestion.product_id == product_id)
            .order_by(ProductQuestion.created_at.desc())
        )
    )
    for q in rows:
        await _attach_usernames(db, q)
    return [_to_out(q) for q in rows]


async def get_question(db: AsyncSession, question_id: str) -> QuestionOut | None:
    q = await _load(db, question_id)
    return _to_out(q) if q else None


async def ask_question(
    db: AsyncSession, *, user_id: str, product_id: str, content: str
) -> QuestionOut:
    q = ProductQuestion(product_id=product_id, user_id=user_id, content=content)
    db.add(q)
    await record(db, user_id, "qna.ask", "product", product_id, content[:50])
    await db.commit()
    loaded = await _load(db, q.id)
    assert loaded is not None
    return _to_out(loaded)


async def answer_question(
    db: AsyncSession, *, user_id: str, question_id: str, content: str
) -> QuestionOut:
    q = (
        await db.scalars(select(ProductQuestion).where(ProductQuestion.id == question_id))
    ).first()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="问题不存在")
    db.add(ProductAnswer(question_id=question_id, user_id=user_id, content=content))
    await record(db, user_id, "qna.answer", "product", q.product_id, content[:50])
    await db.commit()
    loaded = await _load(db, question_id)
    assert loaded is not None
    return _to_out(loaded)


async def accept_answer(
    db: AsyncSession, *, user_id: str, question_id: str, answer_id: str
) -> QuestionOut:
    q = (
        await db.scalars(select(ProductQuestion).where(ProductQuestion.id == question_id))
    ).first()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="问题不存在")
    if q.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅提问者可采纳答案")
    others = list(
        await db.scalars(
            select(ProductAnswer).where(ProductAnswer.question_id == question_id)
        )
    )
    target = None
    for o in others:
        o.is_accepted = 1 if o.id == answer_id else 0
        if o.id == answer_id:
            target = o
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="答案不存在")
    await db.commit()
    loaded = await _load(db, question_id)
    assert loaded is not None
    return _to_out(loaded)


async def delete_question(
    db: AsyncSession, *, user_id: str, question_id: str, is_admin: bool = False
) -> None:
    q = (
        await db.scalars(select(ProductQuestion).where(ProductQuestion.id == question_id))
    ).first()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="问题不存在")
    if not is_admin and q.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除")
    await db.delete(q)
    await db.commit()
