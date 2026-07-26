import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class OrderStatus(str, enum.Enum):
    PENDING_PAYMENT = "pending_payment"
    PAID = "paid"
    SHIPPED = "shipped"
    COMPLETED = "completed"
    REFUND_REQUESTED = "refund_requested"
    REFUND_REJECTED = "refund_rejected"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class Order(Base):
    __tablename__ = "orders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_no = Column(String(40), unique=True, index=True, nullable=False)
    buyer_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    status = Column(SAEnum(OrderStatus), default=OrderStatus.PENDING_PAYMENT, nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    discount_amount = Column(Numeric(12, 2), default=0, nullable=False, server_default="0")
    address = Column(Text)
    refund_reason = Column(Text)
    refund_amount = Column(Numeric(12, 2), nullable=False, default=0)
    tracking_no = Column(String(60))
    logistics = Column(Text)  # JSON 字符串，物流轨迹数组
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    paid_at = Column(DateTime(timezone=True), nullable=True)
    shipped_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    buyer = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_order_buyer", "buyer_id"),
        Index("ix_order_status", "status"),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    variant_id = Column(String(36), ForeignKey("product_variants.id"), nullable=True, index=True)
    quantity = Column(Integer, nullable=False)
    price = Column(Numeric(12, 2), nullable=False)
    variant_info = Column(Text)

    order = relationship("Order", back_populates="items")
