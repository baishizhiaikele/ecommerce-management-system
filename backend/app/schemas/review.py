from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.review import Sentiment


class ReviewCreate(BaseModel):
    order_id: Optional[str] = None  # 不传则自动匹配该用户已完成且未评价的订单
    rating: int = Field(ge=1, le=5)
    content: str = Field(min_length=1, max_length=1000)
    images: Optional[list[str]] = None
    video: Optional[str] = None


class ReviewOut(BaseModel):
    id: str
    order_id: str
    product_id: str
    user_id: str
    username: Optional[str] = None
    rating: int
    content: str
    sentiment: Sentiment
    reply: Optional[str] = None
    is_pinned: bool = False
    helpful_count: int = 0
    report_count: int = 0
    created_at: datetime
    images: list[str] = []
    video: Optional[str] = None
    append_content: Optional[str] = None
    append_at: Optional[datetime] = None
    append_images: list[str] = []


class ReplyIn(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class PinIn(BaseModel):
    pinned: bool = True


class ReviewDistributionOut(BaseModel):
    product_id: str
    total: int
    average: float
    distribution: dict


class MerchantReviewPage(BaseModel):
    items: list[ReviewOut]
    total: int
    page: int
    page_size: int


class ReviewReportIn(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=300)


class AppendIn(BaseModel):
    content: str = Field(min_length=1, max_length=1000)
    images: Optional[list[str]] = None
    video: Optional[str] = None
