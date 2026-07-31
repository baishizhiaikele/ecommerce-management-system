"""任务中心服务：定义任务目录，自动检测完成状态，发放积分奖励。

任务类型均为「自动完成」——根据用户的签到 / 资料 / 订单 / 评价 / 收藏等行为
自动标记完成，用户只需手动「领取」积分奖励。复用现有 points_service 发放积分。
"""
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.favorite import Favorite
from app.models.order import Order, OrderStatus
from app.models.points import PointAction, PointLog
from app.models.review import Review
from app.models.task import UserTask
from app.models.user import User
from app.services.points_service import add_points

# 任务目录：key 唯一；reward_points 为完成后可领取的积分
TASK_CATALOG: list[dict] = [
    {"key": "daily_signin", "title": "每日签到", "description": "今日完成一次签到", "reward_points": 10},
    {"key": "complete_profile", "title": "完善资料", "description": "设置头像与个性签名", "reward_points": 20},
    {"key": "first_order", "title": "完成首单", "description": "完成第一笔订单", "reward_points": 50},
    {"key": "first_review", "title": "发表评价", "description": "发表第一条商品评价", "reward_points": 30},
    {"key": "favorite_3", "title": "收藏好物", "description": "收藏 3 件商品", "reward_points": 15},
]


async def _gather_facts(db: AsyncSession, user: User) -> dict:
    """统计用户当前各项任务完成事实。"""
    today = date.today().isoformat()
    # created_at 以 UTC 存储，这里必须用 localtime 折算成服务器本地日期，
    # 才能与 date.today() 及签到接口 _signed_today 的口径保持一致（否则 UTC+8 凌晨会误判未签到）
    signed_today = await db.scalar(
        select(func.count(PointLog.id)).where(
            PointLog.user_id == user.id,
            PointLog.action == PointAction.SIGNIN,
            func.date(PointLog.created_at, "localtime") == today,
        )
    )
    fav_count = await db.scalar(
        select(func.count(Favorite.id)).where(Favorite.user_id == user.id)
    )
    order_count = await db.scalar(
        select(func.count(Order.id)).where(
            Order.buyer_id == user.id, Order.status == OrderStatus.COMPLETED
        )
    )
    review_count = await db.scalar(
        select(func.count(Review.id)).where(Review.user_id == user.id)
    )
    return {
        "daily_signin": bool(signed_today),
        "complete_profile": bool(user.avatar) and bool(user.description),
        "first_order": bool(order_count),
        "first_review": bool(review_count),
        "favorite_3": (fav_count or 0) >= 3,
    }


async def sync_user_tasks(db: AsyncSession, user: User) -> None:
    """确保每条任务都有记录，并按当前行为刷新完成状态（不提交）。"""
    facts = await _gather_facts(db, user)
    for defn in TASK_CATALOG:
        ut = await db.scalar(
            select(UserTask).where(
                UserTask.user_id == user.id, UserTask.task_key == defn["key"]
            )
        )
        if not ut:
            ut = UserTask(
                user_id=user.id, task_key=defn["key"], reward_points=defn["reward_points"]
            )
            db.add(ut)
        if facts.get(defn["key"], False) and not ut.completed:
            ut.completed = True
            ut.completed_at = datetime.now(timezone.utc)
    await db.flush()


async def list_tasks(db: AsyncSession, user: User) -> list[dict]:
    """返回任务中心列表（含每个任务的完成 / 领取状态）。"""
    await sync_user_tasks(db, user)
    await db.flush()
    rows = list(
        await db.scalars(select(UserTask).where(UserTask.user_id == user.id))
    )
    by_key = {r.task_key: r for r in rows}
    out = []
    for defn in TASK_CATALOG:
        ut = by_key.get(defn["key"])
        out.append(
            {
                "key": defn["key"],
                "title": defn["title"],
                "name": defn["title"],
                "description": defn["description"],
                "reward_points": defn["reward_points"],
                "points": defn["reward_points"],
                "completed": bool(ut and ut.completed),
                "done": bool(ut and ut.completed),
                "claimed": bool(ut and ut.claimed),
            }
        )
    return out


async def claim_task(db: AsyncSession, user: User, task_key: str) -> dict:
    """领取已完成任务的积分奖励（幂等：已领取则报错）。"""
    defn = next((d for d in TASK_CATALOG if d["key"] == task_key), None)
    if not defn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

    await sync_user_tasks(db, user)
    ut = await db.scalar(
        select(UserTask).where(
            UserTask.user_id == user.id, UserTask.task_key == task_key
        )
    )
    if not ut or not ut.completed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="任务尚未完成")
    if ut.claimed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="奖励已领取")

    ut.claimed = True
    await add_points(
        db, user.id, PointAction.TASK_REWARD, ut.reward_points, f"完成任务「{defn['title']}」"
    )
    await db.commit()
    await db.refresh(user)
    return {"task_key": task_key, "gained": ut.reward_points, "points": user.points}
