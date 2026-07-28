from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PresaleCreate(BaseModel):
    product_id: str
    title: str = Field(min_length=2, max_length=100)
    presale_price: Decimal = Field(gt=0)
    deposit: Decimal = Field(gt=0)
    inflate_rate: float = Field(default=1.5, ge=1.0, le=5.0)
    end_at: datetime | None = None


class PresaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    merchant_id: str
    product_id: str
    title: str
    presale_price: Decimal
    deposit: Decimal
    inflate_rate: float
    end_at: datetime | None
    is_active: int
    created_at: datetime | None
    # 冗余展示
    product_name: str | None = None
    product_image: str | None = None
    original_price: Decimal | None = None
    deposit_deduction: float | None = None  # 定金可抵扣金额
    balance_due: float | None = None  # 尾款金额


class ReservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    presale_id: str
    deposit_paid: Decimal
    status: str
    order_id: str | None
    created_at: datetime | None
    completed_at: datetime | None
    # 冗余展示
    presale_title: str | None = None
    product_name: str | None = None
    product_image: str | None = None
    balance_due: float | None = None


class BalancePay(BaseModel):
    address: str = Field(min_length=5, max_length=200)
