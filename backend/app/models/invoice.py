"""电子发票：订单开票记录。"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, Float, ForeignKey, String

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class InvoiceTitleType(str, enum.Enum):
    PERSONAL = "personal"
    COMPANY = "company"


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String(36), primary_key=True, default=_uuid)
    invoice_no = Column(String(32), unique=True, nullable=False)
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=False, unique=True)
    buyer_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    title_type = Column(SAEnum(InvoiceTitleType), default=InvoiceTitleType.PERSONAL, nullable=False)
    title = Column(String(100), nullable=False)
    tax_no = Column(String(30), nullable=True)
    amount = Column(Float, nullable=False)
    pdf_url = Column(String(512), nullable=True)
    issued_at = Column(DateTime(timezone=True), default=_now)
