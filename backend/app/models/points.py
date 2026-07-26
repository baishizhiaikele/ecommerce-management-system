import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db.base import Base


class PointAction(str, enum.Enum):
    ORDER_COMPLETE = "order_complete"
    REDEEM = "redeem"
    REFUND = "refund"
    ADMIN_ADJUST = "admin_adjust"
    SIGNIN = "signin"


class PointLog(Base):
    __tablename__ = "point_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    action = Column(SAEnum(PointAction), nullable=False)
    delta = Column(Integer, nullable=False)  # 正为加、负为减
    balance = Column(Integer, nullable=False)  # 变动后余额
    remark = Column(String(200))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="point_logs")
