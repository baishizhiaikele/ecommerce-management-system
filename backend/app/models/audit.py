import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String, Text

from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), index=True, nullable=True)
    action = Column(String(60), nullable=False)
    entity = Column(String(40), nullable=False)
    entity_id = Column(String(36), nullable=True)
    detail = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
