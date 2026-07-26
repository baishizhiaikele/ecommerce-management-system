from datetime import datetime

from pydantic import BaseModel


class RedemptionItemOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    image_url: str | None = None
    cost_points: int
    type: str
    stock: int
    sold: int
    is_active: bool

    model_config = {"from_attributes": True}


class RedemptionRecordOut(BaseModel):
    id: str
    item_id: str
    item_name: str | None = None
    cost_points: int
    reward: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
