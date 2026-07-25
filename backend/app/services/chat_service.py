import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chat import Conversation, Message, MessageRole
from app.services.audit_service import record
from app.models.product import Product, ProductStatus
from app.schemas.chat import ChatRequest
from app.services.ai_service import ai_service


async def chat(db: AsyncSession, *, user_id: str, data: ChatRequest) -> Conversation:
    product = await db.get(Product, data.product_id)
    if not product or product.status != ProductStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在或未上架")

    if data.conversation_id:
        conversation = await db.get(Conversation, data.conversation_id)
        if not conversation or conversation.user_id != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="会话无权访问")
    else:
        conversation = Conversation(product_id=product.id, user_id=user_id)
        db.add(conversation)
        await db.flush()

    history = list(
        await db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at)
        )
    )
    db.add(Message(conversation_id=conversation.id, role=MessageRole.USER, content=data.message))

    ctx = f"商品名：{product.name}；价格：{product.price}；简介：{product.description or '无'}"
    reply = await ai_service.customer_reply(
        product_ctx=ctx,
        history=[{"role": m.role.value, "content": m.content} for m in history],
        question=data.message,
    )
    db.add(Message(conversation_id=conversation.id, role=MessageRole.AI, content=reply))
    await record(db, user_id, "chat.message", "conversation", conversation.id, f"商品 {product.name}")
    await db.commit()
    await db.refresh(conversation, ["messages"])
    return conversation


async def list_conversations(db: AsyncSession, user_id: str) -> list[Conversation]:
    rows = await db.scalars(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.created_at.desc())
        .options(selectinload(Conversation.messages))
    )
    return list(rows)
