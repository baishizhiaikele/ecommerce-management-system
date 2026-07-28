from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LinkCreate(BaseModel):
    product_id: str | None = None


class LinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str | None
    code: str
    clicks: int
    created_at: datetime | None


class TrackIn(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class CommissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_id: str
    order_amount: float
    commission: float
    status: str
    created_at: datetime | None


class SummaryOut(BaseModel):
    total_commission: float
    reversed_commission: float
    withdrawn: float
    available: float
    invitees: int
    clicks: int


class WithdrawalCreate(BaseModel):
    amount: float = Field(gt=0)


class WithdrawalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    amount: float
    status: str
    remark: str | None
    created_at: datetime | None
    processed_at: datetime | None


class WithdrawalProcess(BaseModel):
    approve: bool
    remark: str | None = None
