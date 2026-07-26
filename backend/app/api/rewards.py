from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.reward import RedemptionItemOut, RedemptionRecordOut
from app.services import reward_service

router = APIRouter(prefix="/rewards", tags=["rewards"])


@router.get("", response_model=list[RedemptionItemOut])
async def list_rewards(db: AsyncSession = Depends(get_db)) -> list:
    """积分商城：可兑换的权益列表（公开浏览）。"""
    return await reward_service.list_items(db)


@router.get("/mine", response_model=list[RedemptionRecordOut])
async def my_redemptions(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list:
    """当前用户的历史兑换记录。"""
    return await reward_service.my_records(db, user.id)


@router.post(
    "/{item_id}/redeem",
    response_model=RedemptionRecordOut,
    status_code=status.HTTP_201_CREATED,
)
async def redeem(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RedemptionRecordOut:
    """用积分兑换某项权益（券类自动发放到卡包）。"""
    rec, _ = await reward_service.redeem(db, user, item_id)
    return rec
