"""P3-H 付费会员（PLUS）：叠加在免费成长等级之上的订阅制权益层。"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class PaidMembership(Base):
    """每个用户至多一条 PLUS 记录，续费顺延 expire_at。"""

    __tablename__ = "paid_memberships"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    plan = Column(String(20), nullable=False, default="monthly")  # monthly | yearly
    started_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expire_at = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
