from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.coupon import CouponOut, UserCouponOut
from app.services import coupon_service

router = APIRouter(prefix="/coupons", tags=["coupons"])


@router.get("", response_model=list[CouponOut])
async def list_coupons(db: AsyncSession = Depends(get_db)) -> list:
    """可领取的优惠券列表（无需登录即可浏览）。"""
    return await coupon_service.list_active_coupons(db)


@router.post("/{coupon_id}/claim", response_model=UserCouponOut, status_code=status.HTTP_201_CREATED)
async def claim_coupon(
    coupon_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserCouponOut:
    uc = await coupon_service.claim_coupon(db, user.id, coupon_id)
    return UserCouponOut(
        id=uc.id,
        coupon_id=uc.coupon.id,
        name=uc.coupon.name,
        type=uc.coupon.type,
        threshold=uc.coupon.threshold,
        value=uc.coupon.value,
        expire_at=uc.coupon.expire_at,
        is_used=uc.is_used,
        claimed_at=uc.claimed_at,
    )


@router.get("/mine", response_model=list[UserCouponOut])
async def my_coupons(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list:
    rows = await coupon_service.list_my_coupons(db, user.id)
    return [
        UserCouponOut(
            id=uc.id,
            coupon_id=uc.coupon.id,
            name=uc.coupon.name,
            type=uc.coupon.type,
            threshold=uc.coupon.threshold,
            value=uc.coupon.value,
            expire_at=uc.coupon.expire_at,
            is_used=uc.is_used,
            claimed_at=uc.claimed_at,
        )
        for uc in rows
        if uc.coupon is not None
    ]
