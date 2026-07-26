import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class RedemptionType(str, enum.Enum):
    COUPON = "coupon"   # 兑换后发放一张优惠券
    VIRTUAL = "virtual" # 兑换虚拟/实物权益（记录发放）


class RedemptionItem(Base):
    __tablename__ = "redemption_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    description = Column(String(300))
    image_url = Column(String(512))
    cost_points = Column(Integer, nullable=False)
    type = Column(SAEnum(RedemptionType), default=RedemptionType.COUPON, nullable=False)
    stock = Column(Integer, default=0, nullable=False)  # 0 表示不限量
    sold = Column(Integer, default=0, nullable=False)
    # 券类兑换参数
    coupon_type = Column(String(20))  # full_reduce / discount
    coupon_threshold = Column(Numeric(12, 2), default=0)
    coupon_value = Column(Numeric(12, 2))
    coupon_expire_days = Column(Integer, default=30)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class RedemptionRecord(Base):
    __tablename__ = "redemption_records"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    item_id = Column(String(36), ForeignKey("redemption_items.id"), nullable=False)
    item_name = Column(String(100))
    cost_points = Column(Integer, nullable=False)
    reward = Column(String(300))  # 兑付说明
    coupon_id = Column(String(36), ForeignKey("coupons.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="redemption_records")
