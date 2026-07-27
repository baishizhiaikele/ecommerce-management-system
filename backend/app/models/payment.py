import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.sql import func

from app.db.base import Base


class Payment(Base):
    """支付流水。一个订单对应一笔支付，状态机：created → paid → refunded。"""

    __tablename__ = "payments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(
        String(36),
        ForeignKey("orders.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    gateway = Column(String(20), nullable=False, default="sandbox")
    transaction_id = Column(String(64), nullable=True, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(8), nullable=False, default="CNY")
    # created | paid | refunded | failed
    status = Column(String(20), nullable=False, default="created")
    raw_data = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    paid_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
