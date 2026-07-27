"""会员等级服务：成长值累加与等级重算、会员权益查询。"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.member_levels import get_next_tier, get_tier
from app.models.user import User


async def award_growth(db: AsyncSession, user_id: str, amount: int) -> None:
    """累加成长值并按阈值重新计算等级（不提交，由调用方统一 commit）。"""
    if amount <= 0:
        return
    user = await db.get(User, user_id)
    if not user:
        return
    user.growth_value = (user.growth_value or 0) + amount
    user.level = get_tier(user.growth_value)["key"]


def get_membership(user: User) -> dict:
    """返回当前用户的会员等级、成长值、权益及下一等级进度。"""
    growth = user.growth_value or 0
    tier = get_tier(growth)
    nxt = get_next_tier(growth)
    data = {
        "level": tier["key"],
        "level_name": tier["name"],
        "growth_value": growth,
        "discount": tier["discount"],
        "free_shipping": tier["free_shipping"],
        "next_level": None,
    }
    if nxt:
        data["next_level"] = {
            "level": nxt["key"],
            "level_name": nxt["name"],
            "min_growth": nxt["min_growth"],
            "gap": nxt["min_growth"] - growth,
        }
    return data
