from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.order import OrderStatus


class CheckoutRequest(BaseModel):
    address: str = Field(min_length=5, max_length=500)


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
    address: Optional[str]
    items: list[OrderItemOut]
    created_at: datetime
    paid_at: Optional[datetime]
    shipped_at: Optional[datetime]
    completed_at: Optional[datetime]


class OrderStatusUpdate(BaseModel):
    status: OrderStatus
