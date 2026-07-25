import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class MessageRole(str, enum.Enum):
    USER = "user"
    AI = "ai"


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    product = relationship("Product", back_populates="conversations")
    user = relationship("User", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String(36), ForeignKey("conversations.id"), nullable=False)
    role = Column(SAEnum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    conversation = relationship("Conversation", back_populates="messages")
