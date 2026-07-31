from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.coupon import Coupon, CouponType, UserCoupon
from app.models.user import Role, User
from app.schemas.coupon import CouponCreate, CouponUpdate
from app.events import bus


def compute_discount(
    coupon: Coupon,
    subtotal: float,
    category_slugs: set[str] | None = None,
    merchant_ids: set[str] | None = None,
) -> float:
    """根据优惠券类型计算可抵扣金额（元）。结果恒在 [0, subtotal] 内，防止负抵扣。

    额外校验适用范围：
    - applicable_category：仅当订单含该顶级品类商品时可用（空=不限品类）。
    - merchant_id：仅当订单含该商家商品时可用（空=全平台券）。
    任一范围不匹配则返回 0（视为不可用），调用方据此提示「优惠券不适用于当前商品」。
    """
    if subtotal <= 0:
        return 0.0
    # 适用品类校验：文创券（applicable_category='culture'）不能用于耳机等其它品类
    if coupon.applicable_category and category_slugs is not None:
        if coupon.applicable_category not in category_slugs:
            return 0.0
    # 适用商家校验：商家券仅限该商家商品
    if coupon.merchant_id and merchant_ids is not None:
        if coupon.merchant_id not in merchant_ids:
            return 0.0
    if coupon.type == CouponType.FULL_REDUCE:
        if subtotal < float(coupon.threshold or 0):
            return 0.0
        discount = float(coupon.value)
    else:
        # 折扣券：原价 * (1 - 折扣系数)
        ratio = float(coupon.value)
        if not 0 < ratio < 1:
            return 0.0
        discount = round(subtotal * (1 - ratio), 2)
    return max(0.0, min(discount, subtotal))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _in_valid_window(coupon: Coupon, now: datetime | None = None) -> bool:
    """校验优惠券是否处于有效期内（start_at/end_at 为空表示不限制）。"""
    now = now or _now()

    def _aware(dt: datetime) -> datetime:
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    if coupon.start_at and now < _aware(coupon.start_at):
        return False
    if coupon.end_at and now > _aware(coupon.end_at):
        return False
    # 个人券可能有独立过期时间，必须一并校验（否则 end_at 为空时券永久有效）
    expire_at = getattr(coupon, "expire_at", None)
    if expire_at and now > _aware(expire_at):
        return False
    return True


async def list_active_coupons(db: AsyncSession) -> list[Coupon]:
    stmt = select(Coupon).where(Coupon.is_active == True).order_by(Coupon.created_at.desc())  # noqa: E712
    rows = list(await db.scalars(stmt))
    # 仅展示当前处于有效期内的券，避免匿名枚举未开始/已过期的券
    return [c for c in rows if _in_valid_window(c)]


async def claim_coupon(db: AsyncSession, user_id: str, coupon_id: str) -> UserCoupon:
    # 行锁：防止高并发下限量券被超发（与 order_service 锁买家行思路一致）
    coupon = (await db.scalars(select(Coupon).where(Coupon.id == coupon_id).with_for_update())).first()
    if not coupon or not coupon.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="优惠券不存在或已下架")
    if not _in_valid_window(coupon):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="优惠券不在领取有效期内")
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
    try:
        await db.commit()
    except IntegrityError:
        # 唯一约束 (user_id, coupon_id) 兜底：并发重复领取
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="您已领取过该券")
    # 重新查询并预加载 coupon 关系，避免端点序列化时触发异步懒加载（MissingGreenlet）
    uc = await db.scalar(
        select(UserCoupon).options(selectinload(UserCoupon.coupon)).where(UserCoupon.id == uc.id)
    )
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
    uc = await db.scalar(
        select(UserCoupon)
        .options(selectinload(UserCoupon.coupon))
        .with_for_update()
        .where(
            UserCoupon.user_id == user_id,
            UserCoupon.coupon_id == coupon_id,
            UserCoupon.is_used == False,  # noqa: E712
        )
    )
    # 已停用或不在有效期内的券不可用
    if uc and (not uc.coupon or not uc.coupon.is_active or not _in_valid_window(uc.coupon)):
        return None
    return uc


async def use_coupon(db: AsyncSession, uc: UserCoupon) -> None:
    uc.is_used = True
    uc.used_at = datetime.now(timezone.utc)


async def create_coupon(db: AsyncSession, user: User, data: CouponCreate) -> Coupon:
    merchant_id = None
    if user.role == Role.MERCHANT:
        merchant_id = user.id
    elif user.role == Role.ADMIN:
        merchant_id = data.merchant_id
    coupon = Coupon(
        name=data.name,
        type=data.type,
        threshold=data.threshold,
        value=data.value,
        total=data.total,
        start_at=data.start_at,
        end_at=data.end_at,
        expire_at=data.expire_at or data.end_at,  # 到期时间，留空则同步为活动结束时间
        merchant_id=merchant_id,
    )
    db.add(coupon)
    await db.commit()
    await db.refresh(coupon)
    await bus.publish("coupon.created", user_id=user.id, coupon_id=coupon.id)
    return coupon


async def update_coupon(
    db: AsyncSession, coupon_id: str, user: User, data: CouponUpdate
) -> Coupon:
    coupon = await db.get(Coupon, coupon_id)
    if not coupon:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="优惠券不存在")
    if not (
        user.role == Role.ADMIN
        or (user.role == Role.MERCHANT and coupon.merchant_id == user.id)
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作该优惠券")
    for field in ("name", "type", "threshold", "value", "total", "start_at", "end_at", "expire_at", "is_active"):
        val = getattr(data, field, None)
        if val is not None:
            setattr(coupon, field, val)
    if data.end_at is not None and data.expire_at is None:
        coupon.expire_at = data.end_at
    await db.commit()
    await db.refresh(coupon)
    return coupon


async def delete_coupon(db: AsyncSession, coupon_id: str, user: User) -> None:
    coupon = await db.get(Coupon, coupon_id)
    if not coupon:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="优惠券不存在")
    if not (
        user.role == Role.ADMIN
        or (user.role == Role.MERCHANT and coupon.merchant_id == user.id)
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作该优惠券")
    coupon.is_active = False
    await db.commit()


async def list_admin_coupons(db: AsyncSession) -> list[Coupon]:
    stmt = select(Coupon).order_by(Coupon.created_at.desc())
    return list(await db.scalars(stmt))


async def list_merchant_coupons(db: AsyncSession, merchant_id: str) -> list[Coupon]:
    stmt = select(Coupon).where(Coupon.merchant_id == merchant_id).order_by(
        Coupon.created_at.desc()
    )
    return list(await db.scalars(stmt))
