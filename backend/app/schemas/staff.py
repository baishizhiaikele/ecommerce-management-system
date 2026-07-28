from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class StaffCreate(BaseModel):
    username: str
    password: str
    permissions: List[str]


class StaffUpdate(BaseModel):
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None


class StaffOut(BaseModel):
    id: str
    owner_id: str
    staff_user_id: str
    username: str
    permissions: List[str]
    is_active: bool
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
