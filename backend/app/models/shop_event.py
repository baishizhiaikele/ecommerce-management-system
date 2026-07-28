"""店铺动态事件（关注流）。

商家商品「上架（上新）」与「降价」时写入事件，
买家在关注流中按时间倒序查看所关注店铺的动态。
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Index, Numeric, String

from app.db.base import Base


class ShopEvent(Base):
    __tablename__ = "shop_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    product_id = Column(String(36), nullable=True)
    # new_product=上新 / price_drop=降价
    event_type = Column(String(20), nullable=False)
    product_name = Column(String(160), nullable=True)
    image_url = Column(String(512), nullable=True)
    old_price = Column(Numeric(12, 2), nullable=True)
    new_price = Column(Numeric(12, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_shop_event_merchant", "merchant_id"),
        Index("ix_shop_event_created", "created_at"),
    )
