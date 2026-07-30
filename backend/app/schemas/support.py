from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.support import SenderRole, TicketStatus


class SupportAttachmentOut(BaseModel):
    id: str
    url: str
    filename: Optional[str] = None
    content_type: Optional[str] = None


class SupportMessageOut(BaseModel):
    id: str
    sender_role: SenderRole
    content: str
    is_internal: bool = False
    attachments: list[SupportAttachmentOut] = []
    created_at: datetime


class SupportTicketOut(BaseModel):
    id: str
    status: TicketStatus
    subject: Optional[str]
    product_id: Optional[str] = None
    product_name: Optional[str] = None
    order_id: Optional[str] = None
    order_no: Optional[str] = None
    user_id: str
    user_name: str
    priority: str = "normal"
    category: str = "other"
    satisfaction_rating: Optional[int] = None
    satisfaction_comment: Optional[str] = None
    unread_for_buyer: int = 0
    unread_for_merchant: int = 0
    created_at: datetime
    updated_at: datetime
    messages: list[SupportMessageOut] = []


class CreateTicketRequest(BaseModel):
    product_id: Optional[str] = None
    message: str = ""
    subject: Optional[str] = None
    priority: str = "normal"
    category: str = "other"
    order_id: Optional[str] = None
    attachments: list[str] = []


class ReplyRequest(BaseModel):
    content: str = ""
    is_internal: bool = False
    attachments: list[str] = []


class RateTicketRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None


class BatchDeleteTicketsRequest(BaseModel):
    ids: list[str]


class AiReplyOut(BaseModel):
    content: str


class SupportTicketPage(BaseModel):
    items: list[SupportTicketOut]
    total: int
    page: int
    page_size: int
