from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.content import Address
from app.models.notification import Notification, NotificationType
from app.models.points import PointLog, PointAction
from app.models.user import Role, User
from app.schemas.content import AddressCreate, AddressOut, AddressUpdate
from app.services.audit_service import record
from app.services.member_service import get_membership as get_member_info
from app.services.task_service import claim_task, list_tasks

router = APIRouter(prefix="/me", tags=["me"])


@router.get("/addresses", response_model=list[AddressOut])
async def list_addresses(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list:
    rows = await db.scalars(
        select(Address)
        .where(Address.user_id == user.id)
        .order_by(Address.is_default.desc(), Address.created_at)
    )
    return list(rows)


@router.post("/addresses", response_model=AddressOut, status_code=201)
async def create_address(
    data: AddressCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Address:
    if data.is_default:
        await db.execute(
            update(Address).where(Address.user_id == user.id).values(is_default=0)
        )
    addr = Address(user_id=user.id, **data.model_dump())
    db.add(addr)
    await db.flush()
    await record(db, user.id, "address.create", "address", addr.id)
    await db.commit()
    await db.refresh(addr)
    return addr


@router.put("/addresses/{address_id}", response_model=AddressOut)
async def update_address(
    address_id: str,
    data: AddressUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Address:
    addr = await db.get(Address, address_id)
    if not addr or addr.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="地址不存在")
    if data.is_default:
        await db.execute(
            update(Address).where(Address.user_id == user.id).values(is_default=0)
        )
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(addr, field, value)
    await record(db, user.id, "address.update", "address", addr.id)
    await db.commit()
    await db.refresh(addr)
    return addr


@router.delete("/addresses/{address_id}", status_code=204)
async def delete_address(
    address_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    addr = await db.get(Address, address_id)
    if not addr or addr.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="地址不存在")
    await db.delete(addr)
    await db.commit()


@router.post("/signin")
async def signin(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """每日签到：当日首次签到发放积分，连签可叠加奖励（简化版）。"""
    today = date.today()
    already = await db.scalar(
        select(PointLog).where(
            PointLog.user_id == user.id,
            PointLog.action == PointAction.SIGNIN,
            func.date(PointLog.created_at) == today.isoformat(),
        )
    )
    if already:
        return {"signed_today": True, "points": user.points, "gained": 0}

    # 连签天数：统计最近连续签到天数（简化：查最近 7 天签到次数）
    week_ago = date.fromordinal(today.toordinal() - 6).isoformat()
    recent = await db.scalars(
        select(PointLog)
        .where(PointLog.user_id == user.id, PointLog.action == PointAction.SIGNIN, func.date(PointLog.created_at) >= week_ago)
        .order_by(PointLog.created_at)
    )
    streak = len(set(str(r.created_at)[:10] for r in recent))
    gained = 5 + min(streak, 6)  # 基础 5 分，连签每日 +1，封顶 +6

    new_balance = user.points + gained
    user.points = new_balance
    db.add(
        PointLog(
            user_id=user.id,
            action=PointAction.SIGNIN,
            delta=gained,
            balance=new_balance,
            remark=f"每日签到（连签 {streak + 1} 天）",
        )
    )
    db.add(
        Notification(
            user_id=user.id,
            type=NotificationType.POINTS,
            title="签到成功",
            content=f"签到获得 {gained} 积分，当前共 {new_balance} 分",
        )
    )
    await db.commit()
    return {"signed_today": False, "points": new_balance, "gained": gained, "streak": streak + 1}


@router.get("/membership")
async def get_membership(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """当前会员等级、成长值、权益及下一等级进度。"""
    return get_member_info(user)


@router.get("/tasks")
async def list_my_tasks(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> list:
    """任务中心：返回全部任务及其完成 / 领取状态。"""
    return await list_tasks(db, user)


@router.post("/tasks/{task_key}/claim")
async def claim_my_task(
    task_key: str,
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    """领取已完成任务的积分奖励。"""
    return await claim_task(db, user, task_key)
