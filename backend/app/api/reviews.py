from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.review import (
    AppendIn,
    MerchantReviewPage,
    PinIn,
    ReplyIn,
    ReviewCreate,
    ReviewDistributionOut,
    ReviewOut,
    ReviewReportIn,
)
from app.services import review_service

router = APIRouter(prefix="/products", tags=["reviews"])


# 注意：精确路径需定义在带参路径之前，避免被 /{product_id} 捕获
@router.get("/merchant/reviews", response_model=MerchantReviewPage)
async def merchant_reviews(
    db: AsyncSession = Depends(get_db),
    product_id: str | None = None,
    sentiment: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> MerchantReviewPage:
    items, total = await review_service.list_merchant_reviews(
        db,
        merchant_id=user.id,
        product_id=product_id,
        sentiment=sentiment,
        page=page,
        page_size=page_size,
    )
    return MerchantReviewPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/{product_id}/reviews", response_model=list[ReviewOut])
async def list_reviews(product_id: str, db: AsyncSession = Depends(get_db)) -> list:
    return await review_service.list_product_reviews(db, product_id)


@router.get("/{product_id}/reviews/distribution", response_model=ReviewDistributionOut)
async def distribution(product_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    return await review_service.review_distribution(db, product_id=product_id)


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


@router.post("/reviews/{review_id}/reply", response_model=ReviewOut)
async def reply_review(
    review_id: str,
    data: ReplyIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> ReviewOut:
    return await review_service.reply_review(
        db, review_id=review_id, merchant_id=user.id, content=data.content
    )


@router.patch("/reviews/{review_id}/pin", response_model=ReviewOut)
async def pin_review(
    review_id: str,
    data: PinIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> ReviewOut:
    return await review_service.pin_review(
        db, review_id=review_id, merchant_id=user.id, pinned=data.pinned
    )


@router.delete("/reviews/{review_id}")
async def delete_review(
    review_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    if user.role != Role.ADMIN:
        await review_service.delete_review(db, review_id=review_id, merchant_id=user.id)
    else:
        await review_service.delete_review(db, review_id=review_id)
    return {"ok": True}


@router.post("/reviews/{review_id}/helpful", response_model=ReviewOut)
async def mark_review_helpful(
    review_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReviewOut:
    """标记评价「有用」（P2-17）。"""
    return await review_service.mark_helpful(db, review_id=review_id, user_id=user.id)


@router.post("/reviews/{review_id}/report", response_model=ReviewOut)
async def report_review_endpoint(
    review_id: str,
    data: ReviewReportIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReviewOut:
    """举报评价（P2-17）。"""
    return await review_service.report_review(
        db, review_id=review_id, user_id=user.id, reason=data.reason
    )


@router.post("/reviews/{review_id}/append", response_model=ReviewOut)
async def append_review_endpoint(
    review_id: str,
    data: AppendIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReviewOut:
    """买家追评（评价增强）。"""
    return await review_service.append_review(
        db,
        review_id=review_id,
        user_id=user.id,
        content=data.content,
        images=data.images,
        video=data.video,
    )
