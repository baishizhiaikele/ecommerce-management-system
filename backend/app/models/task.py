import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.db.base import Base


class UserTask(Base):
    """用户任务实例：每个任务目录项对应用户的一条记录，记录完成 / 领取状态。"""

    __tablename__ = "user_tasks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    task_key = Column(String(40), nullable=False)
    completed = Column(Boolean, default=False, nullable=False)
    claimed = Column(Boolean, default=False, nullable=False)
    reward_points = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="user_tasks")
