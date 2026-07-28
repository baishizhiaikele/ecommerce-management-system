"""报表定时邮件：商家可配置定期将经营报表发送到指定邮箱。"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import relationship

from app.db.base import Base


class ReportFrequency(str, enum.Enum):
    DAILY = "daily"
    WEEKLY = "weekly"


class ReportTask(Base):
    __tablename__ = "report_tasks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    frequency = Column(Enum(ReportFrequency), default=ReportFrequency.DAILY, nullable=False)
    email = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, server_default="1")
    last_sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    merchant = relationship("User", foreign_keys=[merchant_id])


class EmailLog(Base):
    __tablename__ = "email_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    merchant_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    report_task_id = Column(String(36), ForeignKey("report_tasks.id"), nullable=True)
    to_email = Column(String(255), nullable=False)
    subject = Column(String(255), nullable=False)
    summary = Column(String(2000), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
