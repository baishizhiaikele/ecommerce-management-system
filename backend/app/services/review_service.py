from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.events import bus
from app.models.order import Order, OrderItem, OrderStatus
from app.services.audit_service import record
from app.models.review import Review
from app.schemas.review import ReviewCreate


async def create_review(
    db: AsyncSession, *, user_id: str, product_id: str, order_id: str, data: ReviewCreate
) -> Review:
    order = await db.get(Order, order_id)
    if not order or order.buyer_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能评价自己的订单")
    if order.status != OrderStatus.COMPLETED:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅已完成订单可评价")
    owned_ids = set(
        await db.scalars(select(OrderItem.product_id).where(OrderItem.order_id == order_id))
    )
    if product_id not in owned_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="订单中无此商品")
    already = await db.scalar(
        select(Review).where(
            (Review.order_id == order_id) & (Review.product_id == product_id)
        )
    )
    if already:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该商品已评价")

    review = Review(
        order_id=order_id,
        product_id=product_id,
        user_id=user_id,
        rating=data.rating,
        content=data.content,
    )
    db.add(review)
    await record(db, user_id, "review.create", "review", review.id, f"评分{data.rating}")
    await db.commit()
    await db.refresh(review)
    # 异步触发情感分析，不阻塞响应
    await bus.publish("review.created", review_id=review.id)
    return review


async def list_product_reviews(db: AsyncSession, product_id: str) -> list[Review]:
    rows = await db.scalars(
        select(Review).where(Review.product_id == product_id).order_by(Review.created_at.desc())
    )
    return list(rows)


async def count_negative(db: AsyncSession) -> int:
    from app.models.review import Sentiment

    rows = await db.scalars(select(Review).where(Review.sentiment == Sentiment.NEGATIVE))
    return len(list(rows))
