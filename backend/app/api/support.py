from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.support import SenderRole
from app.models.user import Role, User
from app.schemas.support import CreateTicketRequest, ReplyRequest, SupportTicketOut
from app.services import support_service

router = APIRouter(prefix="/support", tags=["support"])


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
    )


@router.get("/tickets", response_model=list[SupportTicketOut])
async def list_tickets(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SupportTicketOut]:
    if user.role == Role.MERCHANT:
        return await support_service.list_for_merchant(db, user.id)
    return await support_service.list_for_buyer(db, user.id)


@router.get("/tickets/{ticket_id}", response_model=SupportTicketOut)
async def get_ticket(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportTicketOut:
    t = await support_service.get_ticket(db, ticket_id, user)
    return await support_service._to_out(db, t)


@router.post("/tickets/{ticket_id}/messages", response_model=SupportTicketOut)
async def reply(
    ticket_id: str,
    payload: ReplyRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportTicketOut:
    t = await support_service.get_ticket(db, ticket_id, user)
    role = SenderRole.MERCHANT if user.role == Role.MERCHANT else SenderRole.BUYER
    return await support_service.add_message(db, t, role, payload.content)


@router.post("/tickets/{ticket_id}/close", response_model=SupportTicketOut)
async def close(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SupportTicketOut:
    t = await support_service.get_ticket(db, ticket_id, user)
    return await support_service.close_ticket(db, t)
