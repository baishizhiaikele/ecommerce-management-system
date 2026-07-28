"""智能客服知识库（自学习）。

来源两类：
- manual：商家手动录入 FAQ
- learned：工单关闭时自动沉淀（买家首问 → 商家最新回答）

买家提问时可按关键词命中知识条目，实现"知识库自学习"闭环。
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text

from app.db.base import Base


class KnowledgeEntry(Base):
    __tablename__ = "knowledge_entries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    # manual=手动录入 / learned=工单自动沉淀
    source = Column(String(16), nullable=False, default="manual")
    source_ticket_id = Column(String(36), nullable=True)
    hit_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (Index("ix_knowledge_merchant", "merchant_id"),)
