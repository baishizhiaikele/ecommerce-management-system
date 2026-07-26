from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification, NotificationType


async def notify(
    db: AsyncSession,
    user_id: str,
    ntype: NotificationType,
    title: str,
    content: str,
    ref_id: str | None = None,
) -> Notification:
    """创建一条站内信（不提交，由调用方统一 commit）。"""
    n = Notification(
        user_id=user_id, type=ntype, title=title, content=content, ref_id=ref_id
    )
    db.add(n)
    return n


async def unread_count(db: AsyncSession, user_id: str) -> int:
    from sqlalchemy import func, select

    stmt = select(func.count(Notification.id)).where(
        Notification.user_id == user_id, Notification.is_read == False  # noqa: E712
    )
    return int(await db.scalar(stmt) or 0)
