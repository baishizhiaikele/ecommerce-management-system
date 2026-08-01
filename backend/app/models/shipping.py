import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import relationship

from app.db.base import Base


class ShippingTemplate(Base):
    """商家运费模板：默认运费 base_fee，订单满 free_amount 包邮（0 表示不包邮）。

    预留扩展：后续可加入按地区 / 重量阶梯计费（在 service 层叠加规则即可）。
    """

    __tablename__ = "shipping_templates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    base_fee = Column(Numeric(12, 2), default=0, nullable=False)
    free_amount = Column(Numeric(12, 2), default=0, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    merchant = relationship("User", backref="shipping_templates")
