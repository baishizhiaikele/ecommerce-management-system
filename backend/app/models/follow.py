import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base import Base


class FollowShop(Base):
    """买家关注商家（店铺）。本项目店铺即商家用户，故关联 users.id。"""

    __tablename__ = "follow_shops"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", foreign_keys=[user_id])
    merchant = relationship("User", foreign_keys=[merchant_id])

    __table_args__ = (UniqueConstraint("user_id", "merchant_id", name="uq_follow_user_merchant"),)
