"""营销玩法模型（P3-C：秒杀 + 拼团 + 砍价）。"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class GroupBuyStatus(str, enum.Enum):
    OPEN = "open"
    COMPLETED = "completed"
    FAILED = "failed"


class GroupBuy(Base):
    """拼团活动：达到成团人数后，为每位成员生成订单。"""

    __tablename__ = "group_buys"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    initiator_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    title = Column(String(120), nullable=True)
    price = Column(Numeric(12, 2), nullable=False)  # 拼团价
    required_size = Column(Integer, nullable=False, default=2)
    current_size = Column(Integer, nullable=False, default=1)
    status = Column(String(20), default=GroupBuyStatus.OPEN.value, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    members = relationship("GroupBuyMember", back_populates="group", cascade="all, delete-orphan")


class GroupBuyMember(Base):
    __tablename__ = "group_buy_members"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    group_id = Column(String(36), ForeignKey("group_buys.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    address = Column(Text, nullable=True)
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    group = relationship("GroupBuy", back_populates="members")


class BargainStatus(str, enum.Enum):
    ACTIVE = "active"
    LOCKED = "locked"  # 已砍到底价，可下单
    COMPLETED = "completed"


class Bargain(Base):
    """砍价活动：多人帮砍，价格逐步下降，触底后可下单。"""

    __tablename__ = "bargains"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    initiator_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    origin_price = Column(Numeric(12, 2), nullable=False)
    floor_price = Column(Numeric(12, 2), nullable=False)
    current_price = Column(Numeric(12, 2), nullable=False)
    status = Column(String(20), default=BargainStatus.ACTIVE.value, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    cuts = relationship("BargainCut", back_populates="bargain", cascade="all, delete-orphan")


class BargainCut(Base):
    __tablename__ = "bargain_cuts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    bargain_id = Column(String(36), ForeignKey("bargains.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    bargain = relationship("Bargain", back_populates="cuts")
