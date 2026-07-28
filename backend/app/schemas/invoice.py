from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class InvoiceApply(BaseModel):
    title_type: str = Field(pattern="^(personal|company)$")
    title: str = Field(min_length=2, max_length=100)
    tax_no: str | None = Field(default=None, max_length=30)


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    invoice_no: str
    order_id: str
    title_type: str
    title: str
    tax_no: str | None
    amount: float
    issued_at: datetime | None
    # 冗余展示
    order_no: str | None = None
