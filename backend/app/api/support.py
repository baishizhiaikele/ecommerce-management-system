from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.support import SenderRole
from app.models.user import Role, User
from app.schemas.support import (
    AiReplyOut,
    BatchDeleteTicketsRequest,
    CreateTicketRequest,
    RateTicketRequest,
    ReplyRequest,
    SupportTicketOut,
    SupportTicketPage,
)
from app.services import support_service

router = APIRouter(prefix="/support", tags=["support"])


@router.get("/unread")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    count = await support_service.unread_count(db, user)
    return {"unread": count}


@router.post("/tickets", response_model=SupportTicketOut, status_code=201)
async def create_ticket(
    payload: CreateTicketRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportTicketOut:
    return await support_service.create_ticket(
        db,
        buyer=user,
        product_id=payload.product_id,
        message=payload.message,
        subject=payload.subject,
        priority=payload.priority,
        category=payload.category,
        order_id=payload.order_id,
        attachments=payload.attachments,
    )


@router.get("/tickets", response_model=SupportTicketPage)
async def list_tickets(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    status_filter: str | None = Query(None, alias="status"),
    priority: str | None = Query(None),
    category: str | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
) -> SupportTicketPage:
    items, total = await support_service.list_tickets(
        db,
        user=user,
        status_filter=status_filter,
        priority=priority,
        category=category,
        search=search,
        page=page,
        page_size=page_size,
    )
    return SupportTicketPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/tickets/{ticket_id}", response_model=SupportTicketOut)
async def get_ticket(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportTicketOut:
    t = await support_service.get_ticket(db, ticket_id, user)
    await support_service.mark_read(db, t, user)
    return await support_service._to_out(db, t, user.role.value)


@router.post("/tickets/{ticket_id}/read")
async def mark_read(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    t = await support_service.get_ticket(db, ticket_id, user)
    await support_service.mark_read(db, t, user)
    return {"ok": True}


@router.post("/tickets/{ticket_id}/messages", response_model=SupportTicketOut)
async def reply(
    ticket_id: str,
    payload: ReplyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportTicketOut:
    t = await support_service.get_ticket(db, ticket_id, user)
    role = SenderRole.MERCHANT if user.role == Role.MERCHANT else SenderRole.BUYER
    return await support_service.add_message(
        db,
        t,
        role,
        payload.content,
        is_internal=payload.is_internal,
        attachments=payload.attachments,
    )


@router.delete("/tickets/{ticket_id}")
async def delete(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    t = await support_service.get_ticket(db, ticket_id, user)
    await support_service.delete_ticket(db, t, user)
    return {"ok": True}


@router.delete("/tickets")
async def batch_delete(
    payload: BatchDeleteTicketsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    deleted = await support_service.delete_tickets(db, user, payload.ids)
    return {"ok": True, "deleted": deleted}


@router.post("/tickets/{ticket_id}/close", response_model=SupportTicketOut)
async def close(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportTicketOut:
    t = await support_service.get_ticket(db, ticket_id, user)
    return await support_service.close_ticket(db, t, user)


@router.post("/tickets/{ticket_id}/rate", response_model=SupportTicketOut)
async def rate(
    ticket_id: str,
    payload: RateTicketRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportTicketOut:
    t = await support_service.get_ticket(db, ticket_id, user)
    return await support_service.rate_ticket(db, t, user, payload.rating, payload.comment)


@router.post("/tickets/{ticket_id}/ai-reply", response_model=AiReplyOut)
async def ai_reply(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AiReplyOut:
    t = await support_service.get_ticket(db, ticket_id, user)
    content = await support_service.ai_draft_reply(db, t)
    return AiReplyOut(content=content)
