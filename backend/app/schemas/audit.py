from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: str
    user_id: Optional[str]
    action: str
    entity: str
    entity_id: Optional[str]
    detail: Optional[str]
    created_at: datetime
