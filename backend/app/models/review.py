import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class Sentiment(str, enum.Enum):
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    NEGATIVE = "negative"


class Review(Base):
    __tablename__ = "reviews"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=False)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, nullable=False)
    content = Column(Text)
    sentiment = Column(SAEnum(Sentiment), default=Sentiment.NEUTRAL)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="reviews")
    product = relationship("Product", back_populates="reviews")

    __table_args__ = (Index("ix_review_product", "product_id"),)
