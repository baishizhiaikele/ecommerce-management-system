from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.product import Product
from app.models.support import (
    SenderRole,
    SupportMessage,
    SupportTicket,
    TicketStatus,
)
from app.models.user import User
from app.schemas.support import SupportMessageOut, SupportTicketOut


async def _reload(db: AsyncSession, ticket_id: str) -> SupportTicket:
    """commit 后重载工单并预加载 messages，避免序列化时触发 async lazy-load。"""
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.messages))
        .where(SupportTicket.id == ticket_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


async def _to_out(db: AsyncSession, t: SupportTicket) -> SupportTicketOut:
    product = await db.get(Product, t.product_id) if t.product_id else None
    user = await db.get(User, t.user_id)
    return SupportTicketOut(
        id=t.id,
        status=t.status,
        subject=t.subject,
        product_id=t.product_id,
        product_name=product.name if product else None,
        user_id=t.user_id,
        user_name=user.username if user else "用户",
        created_at=t.created_at,
        updated_at=t.updated_at,
        messages=[
            SupportMessageOut(
                id=m.id,
                sender_role=m.sender_role,
                content=m.content,
                created_at=m.created_at,
            )
            for m in t.messages
        ],
    )


async def create_ticket(
    db: AsyncSession,
    *,
    buyer: User,
    product_id: str | None,
    message: str,
    subject: str | None,
) -> SupportTicketOut:
    merchant_id = buyer.id
    if product_id:
        product = await db.get(Product, product_id)
        if not product:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在")
        merchant_id = product.merchant_id
    ticket = SupportTicket(
        user_id=buyer.id,
        merchant_id=merchant_id,
        product_id=product_id,
        subject=subject,
        status=TicketStatus.OPEN,
    )
    ticket.messages.append(
        SupportMessage(sender_role=SenderRole.BUYER, content=message)
    )
    db.add(ticket)
    await db.commit()
    ticket = await _reload(db, ticket.id)
    return await _to_out(db, ticket)


async def list_for_merchant(db: AsyncSession, merchant_id: str) -> list[SupportTicketOut]:
    stmt = (
        select(SupportTicket)
        .options(selectinload(SupportTicket.messages))
        .where(SupportTicket.merchant_id == merchant_id)
        .order_by(SupportTicket.updated_at.desc())
    )
    rows = await db.scalars(stmt)
    out = []
    for t in rows:
        out.append(await _to_out(db, t))
    return out


async def list_for_buyer(db: AsyncSession, user_id: str) -> list[SupportTicketOut]:
    stmt = (
        select(SupportTicket)
        .options(selectinload(SupportTicket.messages))
        .where(SupportTicket.user_id == user_id)
        .order_by(SupportTicket.updated_at.desc())
    )
    rows = await db.scalars(stmt)
    out = []
    for t in rows:
        out.append(await _to_out(db, t))
    return out


async def get_ticket(db: AsyncSession, ticket_id: str, user: User) -> SupportTicket:
    t = await db.get(SupportTicket, ticket_id, options=[selectinload(SupportTicket.messages)])
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="工单不存在")
    if user.role == "merchant" and t.merchant_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问")
    if user.role == "buyer" and t.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问")
    return t


async def add_message(
    db: AsyncSession, ticket: SupportTicket, sender_role: SenderRole, content: str
) -> SupportTicketOut:
    ticket.messages.append(SupportMessage(sender_role=sender_role, content=content))
    ticket.status = (
        TicketStatus.ANSWERED if sender_role == SenderRole.MERCHANT else TicketStatus.OPEN
    )
    await db.commit()
    ticket = await _reload(db, ticket.id)
    return await _to_out(db, ticket)


async def close_ticket(db: AsyncSession, ticket: SupportTicket) -> SupportTicketOut:
    ticket.status = TicketStatus.CLOSED
    # 知识库自学习：关闭时沉淀 买家首问 → 商家最新回答
    from app.services import knowledge_service

    await knowledge_service.learn_from_ticket(db, ticket, commit=False)
    await db.commit()
    ticket = await _reload(db, ticket.id)
    return await _to_out(db, ticket)
