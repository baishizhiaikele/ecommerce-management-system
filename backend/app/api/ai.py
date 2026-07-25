from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.chat import ChatRequest, ChatResponse, ConversationOut
from app.services import chat_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatResponse:
    conversation = await chat_service.chat(db, user_id=user.id, data=data)
    reply = next((m.content for m in reversed(conversation.messages) if m.role.value == "ai"), "")
    return ChatResponse(conversation_id=conversation.id, reply=reply)


@router.get("/conversations", response_model=list[ConversationOut])
async def conversations(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list:
    return await chat_service.list_conversations(db, user.id)
