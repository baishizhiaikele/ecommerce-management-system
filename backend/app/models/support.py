import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class TicketStatus(str, enum.Enum):
    OPEN = "open"
    ANSWERED = "answered"
    CLOSED = "closed"


class SenderRole(str, enum.Enum):
    BUYER = "buyer"
    MERCHANT = "merchant"
    AI = "ai"


class TicketPriority(str, enum.Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class TicketCategory(str, enum.Enum):
    INQUIRY = "inquiry"        # 咨询
    AFTERSALE = "aftersale"    # 售后
    LOGISTICS = "logistics"    # 物流
    OTHER = "other"            # 其他


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=True)
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=True)
    subject = Column(String(200))
    status = Column(SAEnum(TicketStatus, values_callable=lambda e: [m.value for m in e]), default=TicketStatus.OPEN, nullable=False)
    priority = Column(SAEnum(TicketPriority, values_callable=lambda e: [m.value for m in e]), default=TicketPriority.NORMAL, nullable=False)
    category = Column(SAEnum(TicketCategory, values_callable=lambda e: [m.value for m in e]), default=TicketCategory.OTHER, nullable=False)
    satisfaction_rating = Column(Integer, nullable=True)
    satisfaction_comment = Column(Text, nullable=True)
    # 未读计数：分别记录买家 / 商家各自视角下尚未查看的消息数（内部备注不计入买家未读）
    unread_for_buyer = Column(Integer, default=0, nullable=False, server_default="0")
    unread_for_merchant = Column(Integer, default=0, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user = relationship("User", foreign_keys=[user_id])
    merchant = relationship("User", foreign_keys=[merchant_id])
    product = relationship("Product")
    order = relationship("Order")
    messages = relationship(
        "SupportMessage",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="SupportMessage.created_at",
    )


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id = Column(String(36), ForeignKey("support_tickets.id"), nullable=False, index=True)
    sender_role = Column(SAEnum(SenderRole, values_callable=lambda e: [m.value for m in e]), default=SenderRole.BUYER, nullable=False)
    content = Column(Text, nullable=False)
    # 内部备注：仅商家可见，不展示给买家，且不计入买家未读
    is_internal = Column(Boolean, default=False, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    ticket = relationship("SupportTicket", back_populates="messages")
    attachments = relationship(
        "SupportAttachment",
        back_populates="message",
        cascade="all, delete-orphan",
        order_by="SupportAttachment.created_at",
    )


class SupportAttachment(Base):
    __tablename__ = "support_attachments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    message_id = Column(String(36), ForeignKey("support_messages.id"), nullable=False, index=True)
    url = Column(String(512), nullable=False)
    filename = Column(String(255), nullable=True)
    content_type = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    message = relationship("SupportMessage", back_populates="attachments")
