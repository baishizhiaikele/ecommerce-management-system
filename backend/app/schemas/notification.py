from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.notification import NotificationType


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    type: NotificationType
    title: str
    content: Optional[str]
    ref_id: Optional[str]
    is_read: bool
    created_at: datetime
