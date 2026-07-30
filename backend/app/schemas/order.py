from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.order import OrderStatus


class CheckoutRequest(BaseModel):
    address: str = Field(min_length=5, max_length=500)
    receiver: Optional[str] = Field(default=None, max_length=60)
    contact: Optional[str] = Field(default=None, max_length=40)
    coupon_id: Optional[str] = None
    use_points: bool = False
    delivery_type: str = Field(default="express", pattern="^(express|pickup)$")
    pickup_store: Optional[str] = Field(default=None, max_length=200)
    cart_item_ids: list[str] = []


class OrderItemOut(BaseModel):
    id: str
    product_id: str
    name: str
    image_url: Optional[str] = None
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
    return_tracking_no: Optional[str] = None
    return_carrier: Optional[str] = None
    dispute_reason: Optional[str] = None
    address: Optional[str]
    receiver: Optional[str] = None
    contact: Optional[str] = None
    delivery_type: str = "express"
    pickup_store: Optional[str] = None
    pickup_code: Optional[str] = None
    picked_up_at: Optional[datetime] = None
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


class ReturnShipRequest(BaseModel):
    tracking_no: str = Field(min_length=1, max_length=60)
    carrier: str = Field(min_length=1, max_length=60)
    note: str = ""


class ExchangeRequest(BaseModel):
    note: str = ""


class DisputeRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class PickupVerifyRequest(BaseModel):
    pickup_code: str = Field(min_length=4, max_length=12)


class LogisticsEvent(BaseModel):
    time: str
    location: str = ""
    description: str


class LogisticsUpdate(BaseModel):
    tracking_no: str = ""
    event: LogisticsEvent
