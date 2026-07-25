from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def record(
    db: AsyncSession,
    user_id: str | None,
    action: str,
    entity: str,
    entity_id: str | None = None,
    detail: str | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=str(user_id) if user_id else None,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id else None,
            detail=detail,
        )
    )
    await db.flush()
