"""P3-G 内容化轻量接入：种草笔记（图文内容挂商品卡）。"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, UniqueConstraint

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class NoteReviewStatus(str, enum.Enum):
    """笔记审核状态机（种草社区审核闭环）：

    pending -> approved（公开可见）| rejected（下架，附原因）
    历史直接公开的笔记通过数据迁移归并为 approved。
    """

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ShoppingNote(Base):
    """种草笔记：任何登录用户可发布，图文 + 挂载商品。需审核通过后方公开（审核闭环）。"""

    __tablename__ = "shopping_notes"

    id = Column(String(36), primary_key=True, default=_uuid)
    author_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    images = Column(Text)  # JSON 数组：图片 URL 列表
    product_ids = Column(Text)  # JSON 数组：挂载的商品 id 列表
    likes_count = Column(Integer, nullable=False, default=0, server_default="0")
    review_status = Column(SAEnum(NoteReviewStatus), nullable=False, default=NoteReviewStatus.PENDING)
    reject_reason = Column(String(255), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # 商业化闭环：发布时若为挂载商品生成作者专属推广码，点击/下单都归因到作者
    affiliate_code = Column(String(12), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class NoteLike(Base):
    """笔记点赞（一人一赞）。"""

    __tablename__ = "note_likes"
    __table_args__ = (UniqueConstraint("note_id", "user_id", name="uq_note_like"),)

    id = Column(String(36), primary_key=True, default=_uuid)
    note_id = Column(String(36), ForeignKey("shopping_notes.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
