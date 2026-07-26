from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coupon import Coupon, CouponType, UserCoupon
from app.models.points import PointAction, PointLog
from app.models.reward import RedemptionItem, RedemptionRecord, RedemptionType
from app.models.user import User


async def list_items(db: AsyncSession) -> list[RedemptionItem]:
    stmt = (
        select(RedemptionItem)
        .where(RedemptionItem.is_active == True)  # noqa: E712
        .order_by(RedemptionItem.cost_points.asc())
    )
    return list(await db.scalars(stmt))


async def my_records(db: AsyncSession, user_id: str) -> list[RedemptionRecord]:
    stmt = (
        select(RedemptionRecord)
        .where(RedemptionRecord.user_id == user_id)
        .order_by(RedemptionRecord.created_at.desc())
    )
    return list(await db.scalars(stmt))


async def redeem(db: AsyncSession, user: User, item_id: str) -> tuple[RedemptionRecord, int]:
    item = await db.get(RedemptionItem, item_id)
    if not item or not item.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="兑换项不存在或已下架")
    if item.stock and item.sold >= item.stock:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="已兑换完")
    if user.points < item.cost_points:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="积分不足")

    # 扣减积分并写流水
    user.points -= item.cost_points
    db.add(
        PointLog(
            user_id=user.id,
            action=PointAction.REDEEM,
            delta=-item.cost_points,
            balance=user.points,
            remark=f"积分商城兑换「{item.name}」",
        )
    )

    coupon_id = None
    reward = item.description or item.name
    if item.type == RedemptionType.COUPON:
        ctype = CouponType.DISCOUNT if item.coupon_type == "discount" else CouponType.FULL_REDUCE
        now = datetime.now(timezone.utc)
        expire = now + timedelta(days=item.coupon_expire_days or 30)
        coupon = Coupon(
            name=item.name,
            type=ctype,
            threshold=item.coupon_threshold or 0,
            value=item.coupon_value or 0,
            total=0,
            merchant_id=None,
            start_at=now,
            end_at=expire,
            expire_at=expire,
            is_active=True,
        )
        db.add(coupon)
        await db.flush()
        db.add(UserCoupon(user_id=user.id, coupon_id=coupon.id))
        coupon_id = coupon.id
        reward = f"已发放优惠券「{item.name}」，请至卡包查看"

    rec = RedemptionRecord(
        user_id=user.id,
        item_id=item.id,
        item_name=item.name,
        cost_points=item.cost_points,
        reward=reward,
        coupon_id=coupon_id,
    )
    db.add(rec)
    item.sold += 1
    await db.commit()
    await db.refresh(user)
    return rec, user.points
