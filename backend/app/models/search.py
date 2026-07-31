from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String

from app.db.base import Base


class SearchKeyword(Base):
    __tablename__ = "search_keywords"

    keyword = Column(String(120), primary_key=True)
    count = Column(Integer, nullable=False, default=1)
    last_searched = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ImageFeature(Base):
    """商品图片特征（P1-1 图搜）。

    - phash：感知哈希（纯算法，无需外部依赖），用于无 key 降级下的相似图搜索；
    - embedding：预留向量列（配置 VISION_API_KEY 后可存多模态向量，做语义图搜）。
    """

    __tablename__ = "image_features"

    id = Column(String(36), primary_key=True, default=lambda: __import__("uuid").uuid4().hex)
    product_id = Column(String(36), index=True, nullable=False)
    phash = Column(String(32), index=True, nullable=True)
    embedding = Column(String(2000), nullable=True)  # JSON 数组，预留
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
