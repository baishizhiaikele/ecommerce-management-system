from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel

from app.models.coupon import CouponType


class CouponOut(BaseModel):
    id: str
    name: str
    type: CouponType
    threshold: Decimal
    value: Decimal
    expire_at: Optional[datetime]
    is_active: bool


class UserCouponOut(BaseModel):
    id: str
    coupon_id: str
    name: str
    type: CouponType
    threshold: Decimal
    value: Decimal
    expire_at: Optional[datetime]
    is_used: bool
    claimed_at: datetime
