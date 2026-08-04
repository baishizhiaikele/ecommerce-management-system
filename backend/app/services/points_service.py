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
    """增加 / 扣减用户积分，并写一条积分流水（不提交，由调用方统一 commit）。

    P0-C5：扣减积分时使用条件更新 WHERE points >= -delta，防止 SQLite 下
    SELECT FOR UPDATE 静默失效导致并发超扣（两个请求各扣 500，用户仅 500 分 → 双花）。
    """
    user = await db.get(User, user_id)
    if not user:
        return
    if delta < 0:
        # 扣减：条件更新，积分不足时 rowcount==0
        from sqlalchemy import update as _update
        result = await db.execute(
            _update(User)
            .where(User.id == user_id, User.points >= -delta)
            .values(points=User.points + delta)
        )
        if result.rowcount == 0:
            raise ValueError("积分不足，无法扣减")
        # 刷新 user 对象以获取最新积分值
        await db.refresh(user)
    else:
        # 增加：直接设值（无超扣风险）
        user.points = max(0, (user.points or 0) + delta)
    db.add(
        PointLog(
            user_id=user_id,
            action=action,
            delta=delta,
            balance=user.points,
            remark=remark,
        )
    )
