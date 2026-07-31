from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.points import PointAction


class PointLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    action: PointAction
    delta: int
    balance: int
    remark: str | None
    created_at: datetime
