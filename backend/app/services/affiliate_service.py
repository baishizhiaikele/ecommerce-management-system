"""分销裂变业务：推广码、点击归因、佣金结算/冲正、提现审批。"""
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.affiliate import (
    AffiliateBinding,
    AffiliateCommission,
    AffiliateLink,
    AffiliateWithdrawal,
    CommissionStatus,
    WithdrawalStatus,
)
from app.models.notification import NotificationType
from app.models.order import Order
from app.models.user import User
from app.services.notification_service import notify

COMMISSION_RATE = 0.05  # 佣金比例：订单实付金额的 5%


def _gen_code() -> str:
    return secrets.token_hex(4)  # 8 位十六进制


async def get_or_create_link(
    db: AsyncSession, *, user_id: str, product_id: str | None = None
) -> AffiliateLink:
    link = await db.scalar(
        select(AffiliateLink).where(
            AffiliateLink.user_id == user_id, AffiliateLink.product_id == product_id
        )
    )
    if link:
        return link
    code = _gen_code()
    while await db.scalar(select(AffiliateLink).where(AffiliateLink.code == code)):
        code = _gen_code()
    link = AffiliateLink(user_id=user_id, product_id=product_id, code=code)
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


async def list_links(db: AsyncSession, user_id: str) -> list[AffiliateLink]:
    rows = await db.scalars(
        select(AffiliateLink)
        .where(AffiliateLink.user_id == user_id)
        .order_by(AffiliateLink.created_at.desc())
    )
    return list(rows)


async def track_click(db: AsyncSession, *, code: str, visitor: User) -> dict:
    """记录一次推广点击；若访问者非推广人本人，则建立/覆盖邀请归因（最后点击优先）。"""
    link = await db.scalar(select(AffiliateLink).where(AffiliateLink.code == code))
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="推广码无效")
    link.clicks = (link.clicks or 0) + 1
    bound = False
    if visitor.id != link.user_id:
        binding = await db.scalar(
            select(AffiliateBinding).where(AffiliateBinding.invitee_id == visitor.id)
        )
        if binding:
            binding.promoter_id = link.user_id
            binding.code = code
        else:
            db.add(AffiliateBinding(invitee_id=visitor.id, promoter_id=link.user_id, code=code))
        bound = True
    await db.commit()
    return {"ok": True, "bound": bound, "product_id": link.product_id}


async def summary(db: AsyncSession, user_id: str) -> dict:
    settled = float(
        await db.scalar(
            select(func.coalesce(func.sum(AffiliateCommission.commission), 0.0)).where(
                AffiliateCommission.promoter_id == user_id,
                AffiliateCommission.status == CommissionStatus.SETTLED,
            )
        )
        or 0.0
    )
    reversed_amt = float(
        await db.scalar(
            select(func.coalesce(func.sum(AffiliateCommission.commission), 0.0)).where(
                AffiliateCommission.promoter_id == user_id,
                AffiliateCommission.status == CommissionStatus.REVERSED,
            )
        )
        or 0.0
    )
    withdrawn = float(
        await db.scalar(
            select(func.coalesce(func.sum(AffiliateWithdrawal.amount), 0.0)).where(
                AffiliateWithdrawal.user_id == user_id,
                AffiliateWithdrawal.status.in_(
                    [WithdrawalStatus.PENDING, WithdrawalStatus.APPROVED]
                ),
            )
        )
        or 0.0
    )
    invitees = int(
        await db.scalar(
            select(func.count(AffiliateBinding.id)).where(AffiliateBinding.promoter_id == user_id)
        )
        or 0
    )
    clicks = int(
        await db.scalar(
            select(func.coalesce(func.sum(AffiliateLink.clicks), 0)).where(
                AffiliateLink.user_id == user_id
            )
        )
        or 0
    )
    return {
        "total_commission": round(settled, 2),
        "reversed_commission": round(reversed_amt, 2),
        "withdrawn": round(withdrawn, 2),
        "available": round(max(settled - withdrawn, 0.0), 2),
        "invitees": invitees,
        "clicks": clicks,
    }


async def list_commissions(db: AsyncSession, user_id: str) -> list[AffiliateCommission]:
    rows = await db.scalars(
        select(AffiliateCommission)
        .where(AffiliateCommission.promoter_id == user_id)
        .order_by(AffiliateCommission.created_at.desc())
    )
    return list(rows)


async def apply_withdrawal(db: AsyncSession, *, user: User, amount: float) -> AffiliateWithdrawal:
    stats = await summary(db, user.id)
    if amount > stats["available"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"可提现余额不足（可用 ¥{stats['available']:.2f}）",
        )
    row = AffiliateWithdrawal(user_id=user.id, amount=round(amount, 2))
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_withdrawals(db: AsyncSession, user_id: str) -> list[AffiliateWithdrawal]:
    rows = await db.scalars(
        select(AffiliateWithdrawal)
        .where(AffiliateWithdrawal.user_id == user_id)
        .order_by(AffiliateWithdrawal.created_at.desc())
    )
    return list(rows)


async def admin_list_withdrawals(db: AsyncSession) -> list[AffiliateWithdrawal]:
    rows = await db.scalars(
        select(AffiliateWithdrawal).order_by(AffiliateWithdrawal.created_at.desc())
    )
    return list(rows)


async def process_withdrawal(
    db: AsyncSession, *, withdrawal_id: str, approve: bool, remark: str | None = None
) -> AffiliateWithdrawal:
    row = await db.get(AffiliateWithdrawal, withdrawal_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="提现申请不存在")
    if row.status != WithdrawalStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该申请已处理")
    row.status = WithdrawalStatus.APPROVED if approve else WithdrawalStatus.REJECTED
    row.remark = remark
    row.processed_at = datetime.now(timezone.utc)
    await notify(
        db,
        row.user_id,
        NotificationType.SYSTEM,
        "提现申请已处理",
        f"您 ¥{row.amount:.2f} 的佣金提现申请已{'通过，款项将原路打款' if approve else ('被驳回：' + (remark or '不符合条件'))}。",
        row.id,
    )
    await db.commit()
    await db.refresh(row)
    return row


async def grant_commission(db: AsyncSession, order: Order) -> AffiliateCommission | None:
    """订单完成时结算佣金（幂等：每单至多一条）。"""
    binding = await db.scalar(
        select(AffiliateBinding).where(AffiliateBinding.invitee_id == order.buyer_id)
    )
    if not binding or binding.promoter_id == order.buyer_id:
        return None
    exists = await db.scalar(
        select(AffiliateCommission).where(AffiliateCommission.order_id == order.id)
    )
    if exists:
        return exists
    amount = float(order.total_amount or 0)
    commission = round(amount * COMMISSION_RATE, 2)
    if commission <= 0:
        return None
    row = AffiliateCommission(
        order_id=order.id,
        promoter_id=binding.promoter_id,
        buyer_id=order.buyer_id,
        order_amount=amount,
        commission=commission,
    )
    db.add(row)
    await notify(
        db,
        binding.promoter_id,
        NotificationType.SYSTEM,
        "分销佣金到账",
        f"您邀请的好友完成订单 {order.order_no}，获得佣金 ¥{commission:.2f}。",
        order.id,
    )
    return row


async def reverse_commission(db: AsyncSession, order_id: str) -> None:
    """订单退款时冲正佣金。"""
    row = await db.scalar(
        select(AffiliateCommission).where(
            AffiliateCommission.order_id == order_id,
            AffiliateCommission.status == CommissionStatus.SETTLED,
        )
    )
    if row:
        row.status = CommissionStatus.REVERSED
