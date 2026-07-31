"""担保交易结算台账（P3-F）。

买家付款 → 资金进入「托管(held)」；买家确认收货(COMPLETED) → 释放给商家(settled)；
退款 → 逆向(reversed)。用于资金对账，避免「仅退款」类资金风险。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Settlement(Base):
    __tablename__ = "settlements"
    __table_args__ = (UniqueConstraint("order_id", "merchant_id", name="uq_settlement_order_merchant"),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(
        String(36), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    merchant_id = Column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(8), nullable=False, default="CNY")
    # held -> settled（释放给商家）/ reversed（退款逆向）
    status = Column(String(20), nullable=False, default="held", index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utcnow)
    settled_at = Column(DateTime(timezone=True), nullable=True)

    order = relationship("Order", back_populates="settlement")
