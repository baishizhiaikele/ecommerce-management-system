"""分销裂变：推广链接、邀请绑定、佣金记录与提现申请。"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now():
    return datetime.now(timezone.utc)


class AffiliateLink(Base):
    """推广链接：每个用户可为全店（product_id 为空）或某商品生成专属推广码。"""

    __tablename__ = "affiliate_links"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=True, index=True)
    code = Column(String(12), unique=True, nullable=False, index=True)
    clicks = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)


class AffiliateBinding(Base):
    """邀请归因：被邀请人 → 推广人（最后点击优先，可被新推广码覆盖）。"""

    __tablename__ = "affiliate_bindings"

    id = Column(String(36), primary_key=True, default=_uuid)
    invitee_id = Column(String(36), ForeignKey("users.id"), nullable=False, unique=True, index=True)
    promoter_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    code = Column(String(12), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)


class CommissionStatus(str, enum.Enum):
    SETTLED = "settled"
    REVERSED = "reversed"


class AffiliateCommission(Base):
    """佣金记录：被邀请人订单完成时结算，退款时冲正。"""

    __tablename__ = "affiliate_commissions"

    id = Column(String(36), primary_key=True, default=_uuid)
    order_id = Column(String(36), ForeignKey("orders.id"), nullable=False, unique=True)
    promoter_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    buyer_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    order_amount = Column(Float, nullable=False)
    commission = Column(Float, nullable=False)
    status = Column(SAEnum(CommissionStatus), default=CommissionStatus.SETTLED, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)


class WithdrawalStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class AffiliateWithdrawal(Base):
    """佣金提现申请：由平台管理员审批。"""

    __tablename__ = "affiliate_withdrawals"

    id = Column(String(36), primary_key=True, default=_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    status = Column(SAEnum(WithdrawalStatus), default=WithdrawalStatus.PENDING, nullable=False)
    remark = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    processed_at = Column(DateTime(timezone=True), nullable=True)
