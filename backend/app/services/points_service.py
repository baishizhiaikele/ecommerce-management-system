from sqlalchemy.ext.asyncio import AsyncSession

from app.models.points import PointAction, PointLog
from app.models.user import User

# 积分规则：消费 1 元得 1 分；100 积分抵 1 元
POINTS_PER_YUAN = 1
POINTS_REDEEM_RATE = 100


async def add_points(
    db: AsyncSession,
    user_id: str,
    action: PointAction,
    delta: int,
    remark: str | None = None,
) -> None:
    """增加 / 扣减用户积分，并写一条积分流水（不提交，由调用方统一 commit）。"""
    user = await db.get(User, user_id)
    if not user:
        return
    user.points = (user.points or 0) + delta
    db.add(
        PointLog(
            user_id=user_id,
            action=action,
            delta=delta,
            balance=user.points,
            remark=remark,
        )
    )
