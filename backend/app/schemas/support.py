from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.support import SenderRole, TicketStatus


class CreateTicketRequest(BaseModel):
    product_id: Optional[str] = None
    message: str = ""
    subject: Optional[str] = None


class ReplyRequest(BaseModel):
    content: str = ""


class SupportMessageOut(BaseModel):
    id: str
    sender_role: SenderRole
    content: str
    created_at: datetime


class SupportTicketOut(BaseModel):
    id: str
    status: TicketStatus
    subject: Optional[str]
    product_id: Optional[str]
    product_name: Optional[str]
    user_id: str
    user_name: str
    created_at: datetime
    updated_at: datetime
    messages: list[SupportMessageOut]
