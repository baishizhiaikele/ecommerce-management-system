"""用户画像与身份识别（D 方案 A 部分）。

不再依赖前端手动选择的假身份，而是根据登录用户的真实数据推导分群：
- merchant / admin：非买家身份，不面向买家首页编排（返回对应标记供前端区分）。
- buyer 内部再按行为判分：
  - new：注册 7 天内且无任何订单。
  - member：等级 silver/gold 或积分 >= 500（视为高价值会员）。
  - returning：其余普通老客。
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.user import Role, User

_NEW_USER_DAYS = 7
_MEMBER_POINTS = 500
_MEMBER_LEVELS = ("silver", "gold")


async def count_orders(db: AsyncSession, user_id: str) -> int:
    return int(
        await db.scalar(
            select(func.count(Order.id)).where(Order.buyer_id == user_id)
        )
        or 0
    )


async def infer_segment(db: AsyncSession, user: User) -> str:
    """根据真实用户数据推导首页编排分群。"""
    if user.role in (Role.MERCHANT, Role.ADMIN):
        return user.role.value  # "merchant" / "admin"

    order_count = await count_orders(db, user.id)

    # 新客：注册不久且无下单
    created = user.created_at
    if created is not None:
        created_dt = created
        if created_dt.tzinfo is None:
            created_dt = created_dt.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - created_dt) < timedelta(days=_NEW_USER_DAYS):
            if order_count == 0:
                return "new"

    # 会员：高等级或高积分
    level = (user.level or "bronze").lower()
    points = user.points or 0
    if level in _MEMBER_LEVELS or points >= _MEMBER_POINTS:
        return "member"

    # 其余为老客
    return "returning"


def profile_summary(user: User, segment: str, order_count: int) -> dict:
    """给 LLM 决策用的精简画像摘要。"""
    return {
        "segment": segment,
        "role": user.role.value,
        "level": (user.level or "bronze").lower(),
        "points": user.points or 0,
        "order_count": order_count,
    }
