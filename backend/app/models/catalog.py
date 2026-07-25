import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Index, String

from app.db.base import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(80), nullable=False)
    slug = Column(String(80), unique=True, nullable=False)
    parent_id = Column(String(36), ForeignKey("categories.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_category_parent", "parent_id"),)
