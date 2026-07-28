"""P3-H PLUS 付费会员 API。"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services.plus_service import get_plus_status, subscribe

router = APIRouter(prefix="/plus", tags=["plus"])


class SubscribeIn(BaseModel):
    plan: str = Field(pattern="^(monthly|yearly)$")


@router.get("/status")
async def plus_status(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    return await get_plus_status(db, user)


@router.post("/subscribe")
async def plus_subscribe(
    data: SubscribeIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    return await subscribe(db, user=user, plan=data.plan)
