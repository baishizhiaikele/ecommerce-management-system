import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class PromotionType(str, enum.Enum):
    FLASH = "flash"            # 限时秒杀
    DISCOUNT = "discount"      # 限时折扣
    FULL_REDUCE = "full_reduce"  # 满减活动


class Banner(Base):
    """首页轮播运营位。"""

    __tablename__ = "banners"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(120), nullable=False)
    image_url = Column(String(512), nullable=False)
    link_type = Column(String(20), default="product")  # product | category | shop | url
    link_id = Column(String(60), nullable=True)
    link_url = Column(String(512), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Promotion(Base):
    """促销活动：秒杀 / 折扣 / 满减。"""

    __tablename__ = "promotions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(120), nullable=False)
    type = Column(SAEnum(PromotionType), default=PromotionType.FLASH, nullable=False)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=True, index=True)
    discount_price = Column(Numeric(12, 2), nullable=True)
    discount_rate = Column(Numeric(4, 2), nullable=True)  # 如 0.8 表示 8 折
    start_at = Column(DateTime(timezone=True), nullable=True)
    end_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    product = relationship("Product")


class Address(Base):
    """买家收货地址。"""

    __tablename__ = "addresses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    receiver = Column(String(40), nullable=False)
    phone = Column(String(20), nullable=False)
    province = Column(String(40), nullable=False)
    city = Column(String(40), nullable=False)
    district = Column(String(40), nullable=False)
    detail = Column(String(200), nullable=False)
    is_default = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
