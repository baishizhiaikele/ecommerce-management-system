import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class ProductStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING = "pending"
    ACTIVE = "active"
    REJECTED = "rejected"


class Product(Base):
    __tablename__ = "products"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    category_id = Column(String(36), ForeignKey("categories.id"), nullable=True)
    name = Column(String(160), nullable=False)
    description = Column(Text)
    price = Column(Numeric(12, 2), nullable=False)
    stock = Column(Integer, default=0, nullable=False)
    sales_count = Column(Integer, default=0, nullable=False, server_default="0")
    # 低库存预警阈值（P2-18）：库存 <= 该值时记录低库存预警
    warning_threshold = Column(Integer, default=10, nullable=False, server_default="10")
    image_url = Column(String(512))
    images = Column(Text)  # JSON 数组：附加图 URL 列表（首页/详情多图展示）
    specs = Column(Text)   # JSON 对象：规格参数（品牌/材质等）
    status = Column(SAEnum(ProductStatus), default=ProductStatus.DRAFT, nullable=False)
    ai_title = Column(String(200))
    ai_copy = Column(Text)
    ai_price_suggestion = Column(Numeric(12, 2))
    reject_reason = Column(String(300), nullable=True)
    # P2 体验增强：AR 试穿/试用开关与叠加图（前端轻量 AR 试穿组件读取）
    ar_enabled = Column(Integer, default=0, nullable=False, server_default="0")
    ar_overlay_url = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    merchant = relationship("User", back_populates="products")
    reviews = relationship("Review", back_populates="product", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="product", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_product_merchant", "merchant_id"),
        Index("ix_product_status", "status"),
        Index("ix_product_category", "category_id"),
        Index("ix_product_price", "price"),
        Index("ix_product_sales", "sales_count"),
        Index("ix_product_created", "created_at"),
        Index("ix_product_cat_status", "category_id", "status"),
    )


class PriceHistory(Base):
    """P1-3 商品历史价格曲线：每次商品创建/改价时记录一条快照，
    用于前端「历史价格」走势图与比价页（对标慢慢买价格曲线）。"""

    __tablename__ = "price_history"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    price = Column(Numeric(12, 2), nullable=False)
    # 触发来源：create(上架) / update(改价) / promotion(活动价) / rollback(还原)
    source = Column(String(20), default="update", nullable=False)
    # 记录该价格的生效/采集时间（用 created_at 作为曲线横坐标）
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    product = relationship("Product", back_populates="price_history")

    __table_args__ = (Index("ix_price_history_product_time", "product_id", "created_at"),)


# 在 Product 上建立反向关系（放在类外避免循环引用顺序问题）
Product.price_history = relationship(
    "PriceHistory", back_populates="product", cascade="all, delete-orphan", order_by="PriceHistory.created_at"
)
