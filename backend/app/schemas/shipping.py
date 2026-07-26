from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ShippingTemplateCreate(BaseModel):
    name: str
    base_fee: float = 0.0
    free_amount: float = 0.0
    is_default: bool = False


class ShippingTemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    merchant_id: str
    name: str
    base_fee: float
    free_amount: float
    is_default: bool
    created_at: datetime
