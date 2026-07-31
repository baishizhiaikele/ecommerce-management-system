"""直播带货：直播间、直播商品、弹幕消息。"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Integer, String

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class LiveStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    LIVE = "live"
    ENDED = "ended"


class LiveRoom(Base):
    __tablename__ = "live_rooms"

    id = Column(String(36), primary_key=True, default=_uuid)
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(100), nullable=False)
    cover_url = Column(String(500), nullable=True)
    status = Column(SAEnum(LiveStatus), default=LiveStatus.SCHEDULED, nullable=False)
    viewers = Column(Integer, default=0, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)


class LiveRoomProduct(Base):
    __tablename__ = "live_room_products"

    id = Column(String(36), primary_key=True, default=_uuid)
    room_id = Column(String(36), ForeignKey("live_rooms.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False)
    pinned = Column(Integer, default=0, nullable=False)
    # P1-4 直播下单闭环：直播专属价（为空则用商品原价）、是否正在讲解、排序权重
    live_price = Column(String(20), nullable=True, default=None)
    explaining = Column(Integer, default=0, nullable=False)
    sort = Column(Integer, default=0, nullable=False)


class LiveMessage(Base):
    __tablename__ = "live_messages"

    id = Column(String(36), primary_key=True, default=_uuid)
    room_id = Column(String(36), ForeignKey("live_rooms.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    username = Column(String(50), nullable=False)
    content = Column(String(200), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)
