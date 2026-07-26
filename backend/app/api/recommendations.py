from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.product import ProductOut
from app.services import recommendation_service

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("", response_model=list[ProductOut])
async def recommend(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list:
    items = await recommendation_service.recommend_for(db, user.id)
    return items
