from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.coupon import Coupon, CouponType, UserCoupon
from app.models.user import User
from app.events import bus


def compute_discount(coupon: Coupon, subtotal: float) -> float:
    """根据优惠券类型计算可抵扣金额（元）。"""
    if coupon.type == CouponType.FULL_REDUCE:
        if subtotal < float(coupon.threshold or 0):
            return 0.0
        return float(coupon.value)
    # 折扣券：原价 * (1 - 折扣)
    return round(subtotal * (1 - float(coupon.value)), 2)


async def list_active_coupons(db: AsyncSession) -> list[Coupon]:
    stmt = select(Coupon).where(Coupon.is_active == True).order_by(Coupon.created_at.desc())  # noqa: E712
    return list(await db.scalars(stmt))


async def claim_coupon(db: AsyncSession, user_id: str, coupon_id: str) -> UserCoupon:
    coupon = await db.get(Coupon, coupon_id)
    if not coupon or not coupon.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="优惠券不存在或已下架")
    if coupon.total and coupon.issued >= coupon.total:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="优惠券已被领完")
    existing = await db.scalar(
        select(UserCoupon).where(
            UserCoupon.user_id == user_id, UserCoupon.coupon_id == coupon_id
        )
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="您已领取过该券")
    coupon.issued += 1
    uc = UserCoupon(user_id=user_id, coupon_id=coupon_id)
    db.add(uc)
    await db.commit()
    await db.refresh(uc)
    await bus.publish("coupon.claimed", user_id=user_id, coupon_id=coupon_id)
    return uc


async def list_my_coupons(db: AsyncSession, user_id: str) -> list[UserCoupon]:
    stmt = (
        select(UserCoupon)
        .options(selectinload(UserCoupon.coupon))
        .where(UserCoupon.user_id == user_id)
        .order_by(UserCoupon.claimed_at.desc())
    )
    return list(await db.scalars(stmt))


async def find_usable_user_coupon(
    db: AsyncSession, user_id: str, coupon_id: str
) -> UserCoupon | None:
    return await db.scalar(
        select(UserCoupon).where(
            UserCoupon.user_id == user_id,
            UserCoupon.coupon_id == coupon_id,
            UserCoupon.is_used == False,  # noqa: E712
        )
    )


async def use_coupon(db: AsyncSession, uc: UserCoupon) -> None:
    uc.is_used = True
    uc.used_at = datetime.now(timezone.utc)
