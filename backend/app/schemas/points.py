from datetime import datetime

from pydantic import BaseModel

from app.models.points import PointAction


class PointLogOut(BaseModel):
    id: str
    action: PointAction
    delta: int
    balance: int
    remark: str | None
    created_at: datetime
