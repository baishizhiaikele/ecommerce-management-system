"""分销裂变接口：推广链接、点击归因、佣金与提现。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.affiliate import (
    CommissionOut,
    LinkCreate,
    LinkOut,
    SummaryOut,
    TrackIn,
    WithdrawalCreate,
    WithdrawalOut,
    WithdrawalProcess,
)
from app.services import affiliate_service

router = APIRouter(prefix="/affiliate", tags=["affiliate"])


@router.post("/links", response_model=LinkOut)
async def create_link(
    body: LinkCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await affiliate_service.get_or_create_link(
        db, user_id=user.id, product_id=body.product_id
    )


@router.get("/links", response_model=list[LinkOut])
async def my_links(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return await affiliate_service.list_links(db, user.id)


@router.post("/track")
async def track(
    body: TrackIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await affiliate_service.track_click(db, code=body.code, visitor=user)


@router.get("/summary", response_model=SummaryOut)
async def my_summary(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return await affiliate_service.summary(db, user.id)


@router.get("/commissions", response_model=list[CommissionOut])
async def my_commissions(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return await affiliate_service.list_commissions(db, user.id)


@router.post("/withdrawals", response_model=WithdrawalOut)
async def apply_withdrawal(
    body: WithdrawalCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await affiliate_service.apply_withdrawal(db, user=user, amount=body.amount)


@router.get("/withdrawals", response_model=list[WithdrawalOut])
async def my_withdrawals(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return await affiliate_service.list_withdrawals(db, user.id)


@router.get("/admin/withdrawals", response_model=list[WithdrawalOut])
async def admin_withdrawals(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(Role.ADMIN)),
):
    return await affiliate_service.admin_list_withdrawals(db)


@router.post("/admin/withdrawals/{withdrawal_id}", response_model=WithdrawalOut)
async def process_withdrawal(
    withdrawal_id: str,
    body: WithdrawalProcess,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(Role.ADMIN)),
):
    return await affiliate_service.process_withdrawal(
        db, withdrawal_id=withdrawal_id, approve=body.approve, remark=body.remark
    )
