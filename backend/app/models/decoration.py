"""P3-E 商家店铺可视化装修配置。"""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, String, Text, func

from app.db.base import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class ShopDecoration(Base):
    """每个商家一份装修配置：主题色 + 招牌 Banner + 模块化布局(JSON)。

    layout JSON 结构示例：
    [
      {"type": "banner"},
      {"type": "notice", "text": "全场满 99 包邮"},
      {"type": "products", "title": "店长推荐", "product_ids": ["id1", "id2"]},
    ]
    """

    __tablename__ = "shop_decorations"

    id = Column(String(32), primary_key=True, default=_uuid)
    merchant_id = Column(
        String(32), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    theme_color = Column(String(20), nullable=False, default="#1677ff")
    banner_image = Column(String(500))  # 招牌图 URL
    banner_title = Column(String(100))
    banner_subtitle = Column(String(200))
    layout = Column(Text)  # JSON 字符串：模块数组
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
