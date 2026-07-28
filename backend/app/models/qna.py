import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class ProductQuestion(Base):
    """商品问答：买家提问，商家或其他买家回答，提问者可采纳最佳答案。"""

    __tablename__ = "product_questions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String(36), ForeignKey("products.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    answers = relationship(
        "ProductAnswer",
        back_populates="question",
        cascade="all, delete-orphan",
    )

    __table_args__ = (Index("ix_qna_product", "product_id"),)


class ProductAnswer(Base):
    __tablename__ = "product_answers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    question_id = Column(String(36), ForeignKey("product_questions.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    is_accepted = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    question = relationship("ProductQuestion", back_populates="answers")

    __table_args__ = (Index("ix_qna_answer_q", "question_id"),)
