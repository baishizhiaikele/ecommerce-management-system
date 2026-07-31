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


class Warehouse(Base):
    """仓库（P0-2 多仓发货）。

    每个仓库有地理区域（region）与经纬度近似坐标，用于下单时按收货地就近路由。
    库存维度从单一 ``product.stock`` 汇总扩展为「商品 × 仓库」的分仓库存，
    但 ``product.stock`` 仍保留为全仓汇总的展示值（下单扣减仍更新它）。
    """

    __tablename__ = "warehouses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(80), nullable=False)
    region = Column(String(40), nullable=False, index=True)  # 如 华东/华北/华南/西南
    city = Column(String(40), nullable=True)
    # 近似坐标（仅用于距离排序，取城市中心点即可）
    lng = Column(String(20), nullable=True)
    lat = Column(String(20), nullable=True)
    is_default = Column(Integer, nullable=False, default=0)  # 兜底仓（无更近仓时使用）
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    stocks = relationship("InventoryByWarehouse", back_populates="warehouse", cascade="all, delete-orphan")


class InventoryByWarehouse(Base):
    """商品在某仓库的分仓库存（P0-2 多仓发货）。"""

    __tablename__ = "inventory_by_warehouse"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    warehouse_id = Column(String(36), ForeignKey("warehouses.id"), nullable=False, index=True)
    quantity = Column(Integer, nullable=False, default=0)

    product = relationship("Product")
    warehouse = relationship("Warehouse", back_populates="stocks")

    __table_args__ = (
        Index("ix_inv_wh_product_wh", "product_id", "warehouse_id", unique=True),
    )
