from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.follow import FollowShop
from app.models.shop_event import ShopEvent
from app.models.user import Role, User


async def follow(db: AsyncSession, *, user: User, merchant_id: str) -> FollowShop:
    merchant = await db.get(User, merchant_id)
    if not merchant or merchant.role != Role.MERCHANT or not merchant.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="店铺不存在")
    existing = await db.scalar(
        select(FollowShop).where(FollowShop.user_id == user.id, FollowShop.merchant_id == merchant_id)
    )
    if existing:
        return existing
    record = FollowShop(user_id=user.id, merchant_id=merchant_id)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def unfollow(db: AsyncSession, *, user: User, merchant_id: str) -> None:
    record = await db.scalar(
        select(FollowShop).where(FollowShop.user_id == user.id, FollowShop.merchant_id == merchant_id)
    )
    if record:
        await db.delete(record)
        await db.commit()


async def is_following(db: AsyncSession, *, user_id: str, merchant_id: str) -> bool:
    return (
        await db.scalar(
            select(FollowShop.id).where(
                FollowShop.user_id == user_id, FollowShop.merchant_id == merchant_id
            )
        )
        is not None
    )


async def list_following(db: AsyncSession, *, user_id: str, limit: int = 50) -> list:
    stmt = (
        select(User, FollowShop.created_at)
        .join(FollowShop, FollowShop.merchant_id == User.id)
        .where(FollowShop.user_id == user_id, User.role == Role.MERCHANT, User.is_active == True)  # noqa: E712
        .order_by(FollowShop.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.all())


async def count_followers(db: AsyncSession, *, merchant_id: str) -> int:
    return int(
        await db.scalar(
            select(func.count(FollowShop.id)).where(FollowShop.merchant_id == merchant_id)
        )
        or 0
    )


async def record_shop_event(
    db: AsyncSession,
    *,
    merchant_id: str,
    event_type: str,
    product_id: str | None = None,
    product_name: str | None = None,
    image_url: str | None = None,
    old_price=None,
    new_price=None,
    commit: bool = True,
) -> ShopEvent:
    """记录店铺动态事件（上新/降价）。commit=False 时由调用方统一提交。"""
    ev = ShopEvent(
        merchant_id=merchant_id,
        event_type=event_type,
        product_id=product_id,
        product_name=product_name,
        image_url=image_url,
        old_price=old_price,
        new_price=new_price,
    )
    db.add(ev)
    if commit:
        await db.commit()
        await db.refresh(ev)
    return ev


async def list_feed(db: AsyncSession, *, user_id: str, limit: int = 50) -> list:
    """关注流：返回 (ShopEvent, 店铺名) 列表，按时间倒序。"""
    followed = select(FollowShop.merchant_id).where(FollowShop.user_id == user_id)
    stmt = (
        select(ShopEvent, User.username)
        .join(User, User.id == ShopEvent.merchant_id)
        .where(ShopEvent.merchant_id.in_(followed))
        .order_by(ShopEvent.created_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.all())
