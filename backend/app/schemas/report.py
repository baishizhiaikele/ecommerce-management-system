from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.report import ReportFrequency


class ReportTaskCreate(BaseModel):
    frequency: ReportFrequency
    email: str
    is_active: bool = True


class ReportTaskUpdate(BaseModel):
    is_active: Optional[bool] = None
    email: Optional[str] = None
    frequency: Optional[ReportFrequency] = None


class ReportTaskOut(BaseModel):
    id: str
    merchant_id: str
    frequency: str
    email: str
    is_active: bool
    last_sent_at: Optional[str] = None
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class EmailLogOut(BaseModel):
    id: str
    merchant_id: str
    to_email: str
    subject: str
    summary: Optional[str] = None
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
