import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class NotificationType(str, enum.Enum):
    ORDER = "order"
    COUPON = "coupon"
    POINTS = "points"
    REVIEW_ALERT = "review_alert"
    PRICE_DROP = "price_drop"
    SYSTEM = "system"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    type = Column(SAEnum(NotificationType), default=NotificationType.SYSTEM, nullable=False)
    title = Column(String(120), nullable=False)
    content = Column(Text)
    ref_id = Column(String(60), nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="notifications")


class NotificationSetting(Base):
    """每个用户的通知免打扰设置（按分类静音）。"""

    __tablename__ = "notification_settings"

    user_id = Column(String(36), ForeignKey("users.id"), primary_key=True)
    # 逗号分隔的静音分类（NotificationType 值），如 "coupon,points"
    muted = Column(String(500), default="", nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


NOTIFICATION_CATEGORIES = [
    NotificationType.ORDER,
    NotificationType.COUPON,
    NotificationType.POINTS,
    NotificationType.REVIEW_ALERT,
    NotificationType.PRICE_DROP,
    NotificationType.SYSTEM,
]
