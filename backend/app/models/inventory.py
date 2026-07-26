import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class StockChangeType(str, enum.Enum):
    RESTOCK = "restock"          # 采购入库
    ADJUST = "adjust"            # 盘点调整（报溢/报损）
    ORDER_CANCEL = "order_cancel"  # 订单取消回补
    SALE = "sale"                # 销售扣减
    MANUAL = "manual"           # 手动修正


class StockLog(Base):
    __tablename__ = "stock_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    change_type = Column(SAEnum(StockChangeType), nullable=False)
    quantity = Column(Integer, nullable=False)       # 正数增加，负数减少
    balance_after = Column(Integer, nullable=False)  # 变动后库存（对账用）
    remark = Column(String(200), nullable=True)
    operator_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    product = relationship("Product")
    merchant = relationship("User", foreign_keys=[merchant_id])
    operator = relationship("User", foreign_keys=[operator_id])

    __table_args__ = (
        # 同一商品的变动按时间排序便于流水追溯
        Index("ix_stock_product_time", "product_id", "created_at"),
    )
