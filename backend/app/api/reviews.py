from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.review import ReviewCreate, ReviewOut
from app.services import review_service

router = APIRouter(prefix="/products", tags=["reviews"])


@router.get("/{product_id}/reviews", response_model=list[ReviewOut])
async def list_reviews(product_id: str, db: AsyncSession = Depends(get_db)) -> list:
    return await review_service.list_product_reviews(db, product_id)


@router.post("/{product_id}/reviews", response_model=ReviewOut, status_code=201)
async def create_review(
    product_id: str,
    data: ReviewCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReviewOut:
    return await review_service.create_review(
        db, user_id=user.id, product_id=product_id, order_id=data.order_id, data=data
    )
