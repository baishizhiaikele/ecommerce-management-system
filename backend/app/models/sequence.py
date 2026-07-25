import uuid

from sqlalchemy import Column, Integer, String

from app.db.base import Base


class OrderSequence(Base):
    """按日期维护订单自增序号，配合 SELECT ... FOR UPDATE 保证并发唯一。"""

    __tablename__ = "order_seq"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    day = Column(String(8), unique=True, nullable=False)  # YYYYMMDD
    value = Column(Integer, default=0, nullable=False)
