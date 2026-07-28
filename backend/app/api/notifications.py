from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.notification import (
    NOTIFICATION_CATEGORIES,
    Notification,
    NotificationSetting,
    NotificationType,
)
from app.models.user import User
from app.schemas.notification import NotificationOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


class SettingsIn(BaseModel):
    muted: list[str] = []


async def _load_muted(db, user_id: str) -> set:
    s = await db.get(NotificationSetting, user_id)
    if not s or not s.muted:
        return set()
    return {x for x in s.muted.split(",") if x}


@router.get("/categories")
async def list_categories():
    return {"categories": [c.value for c in NOTIFICATION_CATEGORIES]}


@router.get("/settings", response_model=dict)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    muted = await _load_muted(db, user.id)
    return {"muted": list(muted)}


@router.put("/settings", response_model=dict)
async def put_settings(
    body: SettingsIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    muted = [str(x) for x in body.muted if x]
    s = await db.get(NotificationSetting, user.id)
    if not s:
        s = NotificationSetting(user_id=user.id, muted=",".join(muted))
        db.add(s)
    else:
        s.muted = ",".join(muted)
    await db.commit()
    return {"muted": muted}


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list:
    muted = await _load_muted(db, user.id)
    stmt = (
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    )
    rows = await db.scalars(stmt)
    items = [n for n in rows if n.type.value not in muted]
    return [NotificationOut.model_validate(n) for n in items]


@router.get("/unread-count", response_model=dict)
async def unread_count(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    muted = await _load_muted(db, user.id)
    conditions = [
        Notification.user_id == user.id,
        Notification.is_read == False,  # noqa: E712
    ]
    if muted:
        conditions.append(Notification.type.notin_(list(muted)))
    cnt = await db.scalar(select(func.count(Notification.id)).where(*conditions))
    return {"count": int(cnt or 0)}


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationOut:
    n = await db.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="通知不存在")
    n.is_read = True
    await db.commit()
    await db.refresh(n)
    return NotificationOut.model_validate(n)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    await db.execute(
        Notification.__table__.update()
        .where(Notification.user_id == user.id, Notification.is_read == False)  # noqa: E712
        .values(is_read=True)
    )
    await db.commit()
