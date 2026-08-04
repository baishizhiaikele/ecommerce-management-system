"""预售定金：预售活动与买家预约（定金 → 尾款 → 转正式订单）。"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Integer, Numeric, String

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class Presale(Base):
    """预售活动：定金 X 元抵 X*inflate_rate 元（定金膨胀）。"""

    __tablename__ = "presales"

    id = Column(String(36), primary_key=True, default=_uuid)
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    title = Column(String(100), nullable=False)
    presale_price = Column(Numeric(12, 2), nullable=False)
    deposit = Column(Numeric(12, 2), nullable=False)
    inflate_rate = Column(Numeric(4, 2), default=1.5, nullable=False)
    end_at = Column(DateTime(timezone=True), nullable=True)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)


class ReservationStatus(str, enum.Enum):
    DEPOSIT_PAID = "deposit_paid"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PresaleReservation(Base):
    """买家预售预约：已付定金，等待支付尾款。"""

    __tablename__ = "presale_reservations"

    id = Column(String(36), primary_key=True, default=_uuid)
    presale_id = Column(String(36), ForeignKey("presales.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    deposit_paid = Column(Numeric(12, 2), nullable=False)
    status = Column(
        SAEnum(ReservationStatus), default=ReservationStatus.DEPOSIT_PAID, nullable=False
    )
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    completed_at = Column(DateTime(timezone=True), nullable=True)
