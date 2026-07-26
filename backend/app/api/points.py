from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.points import PointLog
from app.models.user import User
from app.schemas.points import PointLogOut

router = APIRouter(prefix="/points", tags=["points"])


@router.get("/history", response_model=list[PointLogOut])
async def point_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list:
    stmt = (
        select(PointLog)
        .where(PointLog.user_id == user.id)
        .order_by(PointLog.created_at.desc())
        .limit(100)
    )
    rows = await db.scalars(stmt)
    return [PointLogOut.model_validate(r) for r in rows]
