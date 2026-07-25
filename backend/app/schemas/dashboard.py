from decimal import Decimal
from typing import Optional

from pydantic import BaseModel


class MerchantStats(BaseModel):
    product_count: int
    active_product_count: int
    order_count: int
    paid_order_count: int
    total_sales: Decimal
    pending_review_count: int
    low_stock_count: int


class AdminStats(BaseModel):
    user_count: int
    merchant_count: int
    product_count: int
    pending_product_count: int
    order_count: int
    total_gmv: Decimal
    negative_review_count: int


class TrendPoint(BaseModel):
    date: str
    amount: Decimal
