from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.review import Sentiment


class ReviewCreate(BaseModel):
    order_id: str
    rating: int = Field(ge=1, le=5)
    content: str = Field(min_length=1, max_length=1000)


class ReviewOut(BaseModel):
    id: str
    order_id: str
    product_id: str
    user_id: str
    rating: int
    content: str
    sentiment: Sentiment
    created_at: datetime
