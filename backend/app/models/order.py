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
    # 仅退款（未发货，平台直接退）
    REFUND_REQUESTED = "refund_requested"
    REFUND_REJECTED = "refund_rejected"
    REFUNDED = "refunded"
    # 退货退款（已发货/已收货后申请退货，需买家寄回 + 商家收货确认）
    RETURN_REQUESTED = "return_requested"
    RETURN_SHIPPED = "return_shipped"
    RETURN_RECEIVED = "return_received"
    # 换货
    EXCHANGE = "exchange"
    # 平台仲裁（2026 仅退款落幕后的纠纷出口）
    DISPUTE = "dispute"
    CANCELLED = "cancelled"


class Order(Base):
    __tablename__ = "orders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_no = Column(String(40), unique=True, index=True, nullable=False)
    buyer_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    status = Column(SAEnum(OrderStatus), default=OrderStatus.PENDING_PAYMENT, nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    discount_amount = Column(Numeric(12, 2), default=0, nullable=False, server_default="0")
    freight = Column(Numeric(12, 2), default=0, nullable=False, server_default="0")
    address = Column(Text)
    # 结构化收货信息（与 address 拆分，便于订单页清晰展示）
    receiver = Column(String(60))
    contact = Column(String(40))
    refund_reason = Column(Text)
    refund_amount = Column(Numeric(12, 2), nullable=False, default=0)
    refund_rejections = Column(Integer, nullable=False, default=0, server_default="0")
    # 退货退款 / 换货 / 仲裁相关字段
    return_tracking_no = Column(String(60))
    return_carrier = Column(String(60))
    dispute_reason = Column(Text)
    return_requested_at = Column(DateTime(timezone=True), nullable=True)
    return_shipped_at = Column(DateTime(timezone=True), nullable=True)
    return_received_at = Column(DateTime(timezone=True), nullable=True)
    exchange_at = Column(DateTime(timezone=True), nullable=True)
    tracking_no = Column(String(60))
    logistics = Column(Text)  # JSON 字符串，物流轨迹数组
    # P3-D 履约方式：express=快递配送（默认）；pickup=到店自提
    delivery_type = Column(String(20), nullable=False, default="express", server_default="express")
    pickup_store = Column(String(200))  # 自提门店名称/地址
    pickup_code = Column(String(12), index=True)  # 支付成功后生成的自提核销码
    picked_up_at = Column(DateTime(timezone=True), nullable=True)  # 核销时间
    # P1-4 直播下单闭环：归因到具体直播间（营销/主播业绩统计）
    live_room_id = Column(String(36), nullable=True, index=True)
    # P3-G 种草商业化闭环：下单时携带的推广码（来自种草笔记分享链接），用于佣金归因
    affiliate_code = Column(String(12), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    paid_at = Column(DateTime(timezone=True), nullable=True)
    shipped_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # 买家软删除标记

    buyer = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    settlement = relationship("Settlement", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_order_buyer", "buyer_id"),
        Index("ix_order_status", "status"),
        Index("ix_order_created", "created_at"),
        Index("ix_order_buyer_created", "buyer_id", "created_at"),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    variant_id = Column(String(36), ForeignKey("product_variants.id"), nullable=True, index=True)
    quantity = Column(Integer, nullable=False)
    price = Column(Numeric(12, 2), nullable=False)
    # 下单时快照商品名称与图片，避免商品下架/改名后订单详情丢失（P1-M11）
    name = Column(String(200), nullable=True)
    image_url = Column(String(500), nullable=True)
    variant_info = Column(Text)
    # P0-2 多仓发货：下单时按收货地就近 + 有货优先选定的发货仓；无分仓数据时为空（沿用单仓逻辑）
    warehouse_id = Column(String(36), ForeignKey("warehouses.id"), nullable=True, index=True)

    order = relationship("Order", back_populates="items")


class AftersaleEvent(Base):
    """P1-5 售后进度可视化：订单售后流转的结构化时间线事件。

    与 audit_log（纯审计）不同，本表面向买家/商家展示「申请退款 → 商家处理
    → 退货物流 → 退款到账」等可读进度，含中文描述与角色标签。
    """

    __tablename__ = "aftersale_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=False, index=True)
    # 事件类型：refund_requested / refund_rejected / refund_approved /
    # return_shipped / return_received / refunded / dispute_opened / dispute_resolved / note
    event_type = Column(String(40), nullable=False)
    # 触发角色：buyer / merchant / admin / system
    actor_role = Column(String(20), nullable=False, default="system")
    title = Column(String(120), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    order = relationship("Order", back_populates="aftersale_events")

    __table_args__ = (Index("ix_aftersale_order_time", "order_id", "created_at"),)


Order.aftersale_events = relationship(
    "AftersaleEvent", back_populates="order", cascade="all, delete-orphan", order_by="AftersaleEvent.created_at"
)
