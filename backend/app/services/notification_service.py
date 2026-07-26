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
    """创建一条站内信（flush 取主键，由调用方统一 commit），并实时推送 WebSocket。"""
    n = Notification(
        user_id=user_id, type=ntype, title=title, content=content, ref_id=ref_id
    )
    db.add(n)
    await db.flush()
    # 实时推送（WebSocket）；失败不影响主流程与持久化
    try:
        from app.core.ws import manager

        await manager.send_personal(
            user_id,
            {
                "id": n.id,
                "type": n.type.value if hasattr(n.type, "value") else n.type,
                "title": n.title,
                "content": n.content,
                "ref_id": n.ref_id,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            },
        )
    except Exception:  # noqa: BLE001
        pass
    return n


async def unread_count(db: AsyncSession, user_id: str) -> int:
    from sqlalchemy import func, select

    stmt = select(func.count(Notification.id)).where(
        Notification.user_id == user_id, Notification.is_read == False  # noqa: E712
    )
    return int(await db.scalar(stmt) or 0)
