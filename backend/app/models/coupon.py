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
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class CouponType(str, enum.Enum):
    FULL_REDUCE = "full_reduce"  # 满 threshold 减 value
    DISCOUNT = "discount"        # 原价 * value（如 0.8 表示 8 折）


class Coupon(Base):
    __tablename__ = "coupons"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    type = Column(SAEnum(CouponType), default=CouponType.FULL_REDUCE, nullable=False)
    threshold = Column(Numeric(12, 2), default=0)  # 满减门槛，折扣券为 0
    value = Column(Numeric(12, 2), nullable=False)  # 满减金额 或 折扣系数
    total = Column(Integer, default=0)   # 发行量，0 表示不限量
    issued = Column(Integer, default=0, nullable=False)
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    # 适用品类：顶级品类 slug（如 "culture"/"digital"）。空=全品类可用。
    # 用于限制「文创满99减15」等品类券只能用于对应品类商品，避免买耳机也能用文创券。
    applicable_category = Column(String(80), nullable=True, default=None, index=True)
    start_at = Column(DateTime(timezone=True), nullable=True)
    end_at = Column(DateTime(timezone=True), nullable=True)
    expire_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class UserCoupon(Base):
    __tablename__ = "user_coupons"
    __table_args__ = (UniqueConstraint("user_id", "coupon_id", name="uq_user_coupon"),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    coupon_id = Column(String(36), ForeignKey("coupons.id"), nullable=False, index=True)
    is_used = Column(Boolean, default=False, nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    claimed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="user_coupons")
    coupon = relationship("Coupon")
