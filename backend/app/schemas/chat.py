from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    product_id: str
    conversation_id: Optional[str] = None
    message: str = Field(min_length=1, max_length=1000)


class ChatResponse(BaseModel):
    conversation_id: str
    reply: str


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime


class ConversationOut(BaseModel):
    id: str
    product_id: str
    created_at: datetime
    messages: list[MessageOut]
