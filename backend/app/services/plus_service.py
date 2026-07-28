"""P3-H PLUS 付费会员服务：订阅/续费、权益查询、下单权益叠加。"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.paid_membership import PaidMembership
from app.models.points import PointAction
from app.models.user import User
from app.services.points_service import add_points

# PLUS 方案配置：价格、时长、开通赠送积分
PLUS_PLANS: dict[str, dict] = {
    "monthly": {"name": "PLUS 月卡", "price": 19.9, "days": 30, "gift_points": 200},
    "yearly": {"name": "PLUS 年卡", "price": 198.0, "days": 365, "gift_points": 2400},
}
# PLUS 专属权益：在会员等级折扣之外，全场再 95 折 + 全场包邮
PLUS_EXTRA_DISCOUNT = 0.95


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime) -> datetime:
    """SQLite 读出的 DateTime 可能不带 tzinfo，统一按 UTC 处理。"""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def get_record(db: AsyncSession, user_id: str) -> PaidMembership | None:
    return await db.scalar(select(PaidMembership).where(PaidMembership.user_id == user_id))


async def is_plus_active(db: AsyncSession, user_id: str) -> bool:
    rec = await get_record(db, user_id)
    return bool(rec and _aware(rec.expire_at) > _now())


async def get_plus_status(db: AsyncSession, user: User) -> dict:
    rec = await get_record(db, user.id)
    active = bool(rec and _aware(rec.expire_at) > _now())
    return {
        "active": active,
        "plan": rec.plan if rec else None,
        "expire_at": rec.expire_at.isoformat() if rec else None,
        "plans": [
            {"key": k, **v} for k, v in PLUS_PLANS.items()
        ],
        "benefits": [
            "全场额外 95 折（可与会员等级折扣叠加）",
            "全场包邮（不限等级）",
            "开通即送积分（月卡 200 / 年卡 2400）",
        ],
    }


async def subscribe(db: AsyncSession, *, user: User, plan: str) -> dict:
    """开通 / 续费 PLUS（沙箱模拟扣费成功）：未过期则顺延，已过期从当前时间起算。"""
    cfg = PLUS_PLANS.get(plan)
    if not cfg:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的订阅方案")
    now = _now()
    rec = await get_record(db, user.id)
    if rec and _aware(rec.expire_at) > now:
        rec.expire_at = _aware(rec.expire_at) + timedelta(days=cfg["days"])  # 续费顺延
        rec.plan = plan
    elif rec:
        rec.started_at = now
        rec.expire_at = now + timedelta(days=cfg["days"])
        rec.plan = plan
    else:
        rec = PaidMembership(
            user_id=user.id, plan=plan, started_at=now, expire_at=now + timedelta(days=cfg["days"])
        )
        db.add(rec)
    # 开通即送积分
    if cfg["gift_points"] > 0:
        await add_points(
            db, user.id, PointAction.TASK_REWARD, cfg["gift_points"], remark=f"开通{cfg['name']}赠送"
        )
    await db.commit()
    return await get_plus_status(db, user)
