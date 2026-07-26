from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.order import OrderStatus


class CheckoutRequest(BaseModel):
    address: str = Field(min_length=5, max_length=500)
    coupon_id: Optional[str] = None
    use_points: bool = False


class OrderItemOut(BaseModel):
    id: str
    product_id: str
    name: str
    price: Decimal
    quantity: int


class OrderOut(BaseModel):
    id: str
    order_no: str
    status: OrderStatus
    total_amount: Decimal
    discount_amount: Decimal = Decimal("0")
    freight: Decimal = Decimal("0")
    refund_amount: Decimal = Decimal("0")
    refund_reason: Optional[str] = None
    address: Optional[str]
    items: list[OrderItemOut]
    created_at: datetime
    paid_at: Optional[datetime]
    shipped_at: Optional[datetime]
    completed_at: Optional[datetime]


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class RefundRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
    image_urls: list[str] = []
    refund_amount: float | None = None  # 部分退款金额；留空表示退全款


class RefundReview(BaseModel):
    approve: bool
    note: str = ""


class LogisticsEvent(BaseModel):
    time: str
    location: str = ""
    description: str


class LogisticsUpdate(BaseModel):
    tracking_no: str = ""
    event: LogisticsEvent
