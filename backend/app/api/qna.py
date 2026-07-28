from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.qna import AnswerCreate, QuestionCreate, QuestionOut
from app.services import qna_service

router = APIRouter(prefix="/products", tags=["qna"])


@router.get("/{product_id}/questions", response_model=list[QuestionOut])
async def list_questions(
    product_id: str, db: AsyncSession = Depends(get_db)
) -> list:
    return await qna_service.list_questions(db, product_id)


@router.post("/{product_id}/questions", response_model=QuestionOut, status_code=201)
async def ask_question(
    product_id: str,
    data: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QuestionOut:
    return await qna_service.ask_question(
        db, user_id=user.id, product_id=product_id, content=data.content
    )


@router.post("/questions/{question_id}/answers", response_model=QuestionOut, status_code=201)
async def answer_question(
    question_id: str,
    data: AnswerCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QuestionOut:
    return await qna_service.answer_question(
        db, user_id=user.id, question_id=question_id, content=data.content
    )


@router.post("/questions/{question_id}/accept/{answer_id}", response_model=QuestionOut)
async def accept_answer(
    question_id: str,
    answer_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QuestionOut:
    return await qna_service.accept_answer(
        db, user_id=user.id, question_id=question_id, answer_id=answer_id
    )


@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    await qna_service.delete_question(
        db,
        user_id=user.id,
        question_id=question_id,
        is_admin=(user.role == Role.ADMIN),
    )
    return {"ok": True}
