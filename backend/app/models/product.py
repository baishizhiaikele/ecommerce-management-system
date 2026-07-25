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
    image_url = Column(String(512))
    status = Column(SAEnum(ProductStatus), default=ProductStatus.DRAFT, nullable=False)
    ai_title = Column(String(200))
    ai_copy = Column(Text)
    ai_price_suggestion = Column(Numeric(12, 2))
    reject_reason = Column(String(300), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    merchant = relationship("User", back_populates="products")
    reviews = relationship("Review", back_populates="product", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="product", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_product_merchant", "merchant_id"),
        Index("ix_product_status", "status"),
        Index("ix_product_category", "category_id"),
    )
