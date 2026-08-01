import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False, index=True)
    sku_code = Column(String(60), nullable=True)
    specs = Column(Text, nullable=False, default="{}")  # JSON: {"颜色": "红", "尺寸": "L"}
    # T16：参与订单金额计算，使用 Numeric(12,2) 精确到分
    price_delta = Column(Numeric(12, 2), default=0)
    stock = Column(Integer, default=0)
    image_url = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    product = relationship("Product")

    def specs_dict(self) -> dict:
        try:
            return json.loads(self.specs or "{}")
        except (ValueError, TypeError):
            return {}


def variant_to_dict(v: "ProductVariant") -> dict:
    return {
        "id": v.id,
        "product_id": v.product_id,
        "sku_code": v.sku_code,
        "specs": v.specs_dict(),
        "price_delta": float(v.price_delta or 0),
        "stock": int(v.stock or 0),
        "image_url": v.image_url,
    }
