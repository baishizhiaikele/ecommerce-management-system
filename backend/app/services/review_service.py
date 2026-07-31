import json
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.events import bus
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.review import Review, Sentiment
from app.services.audit_service import record
from app.schemas.review import ReviewCreate


async def create_review(
    db: AsyncSession, *, user_id: str, product_id: str, order_id: str | None, data: ReviewCreate
) -> Review:
    if not order_id:
        # 未指定订单：自动匹配该用户已完成、包含该商品且尚未评价的最近订单
        reviewed_ids = set(
            await db.scalars(
                select(Review.order_id).where(
                    (Review.product_id == product_id) & (Review.user_id == user_id)
                )
            )
        )
        stmt = (
            select(Order.id)
            .join(OrderItem, OrderItem.order_id == Order.id)
            .where(
                (Order.buyer_id == user_id)
                & (Order.status == OrderStatus.COMPLETED)
                & (OrderItem.product_id == product_id)
            )
            .order_by(Order.created_at.desc())
        )
        for oid in await db.scalars(stmt):
            if oid not in reviewed_ids:
                order_id = oid
                break
        if not order_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="购买并完成订单后才能评价该商品",
            )
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
    if data.images:
        review._images = json.dumps(data.images)
    if data.video:
        review.video = data.video
    db.add(review)
    await record(db, user_id, "review.create", "review", review.id, f"评分{data.rating}")
    await db.commit()
    await db.refresh(review, ["user"])
    # 异步触发情感分析，不阻塞响应
    await bus.publish("review.created", review_id=review.id)
    return review


async def list_product_reviews(db: AsyncSession, product_id: str) -> list[Review]:
    rows = list(
        await db.scalars(
            select(Review)
            .options(selectinload(Review.user))
            .where(Review.product_id == product_id)
            .order_by(Review.is_pinned.desc(), Review.created_at.desc())
        )
    )
    return rows


async def count_negative(db: AsyncSession) -> int:
    rows = await db.scalars(select(Review).where(Review.sentiment == Sentiment.NEGATIVE))
    return len(list(rows))


async def list_merchant_reviews(
    db: AsyncSession,
    *,
    merchant_id: str,
    product_id: str | None = None,
    sentiment: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Review], int]:
    stmt = (
        select(Review)
        .options(selectinload(Review.user))
        .join(Product, Product.id == Review.product_id)
        .where(Product.merchant_id == merchant_id)
    )
    if product_id:
        stmt = stmt.where(Review.product_id == product_id)
    if sentiment:
        stmt = stmt.where(Review.sentiment == Sentiment(sentiment))
    total = int(await db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    stmt = stmt.order_by(Review.is_pinned.desc(), Review.created_at.desc())
    rows = await db.scalars(stmt.offset((page - 1) * page_size).limit(page_size))
    return list(rows), total


async def reply_review(db: AsyncSession, *, review_id: str, merchant_id: str, content: str) -> Review:
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评价不存在")
    product = await db.get(Product, review.product_id)
    if not product or product.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作")
    review.reply = content
    await db.commit()
    await db.refresh(review, ["user"])
    return review


async def pin_review(db: AsyncSession, *, review_id: str, merchant_id: str, pinned: bool) -> Review:
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评价不存在")
    product = await db.get(Product, review.product_id)
    if not product or product.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作")
    review.is_pinned = 1 if pinned else 0
    await db.commit()
    await db.refresh(review, ["user"])
    return review


async def delete_review(
    db: AsyncSession,
    *,
    review_id: str,
    merchant_id: str | None = None,
    user_id: str | None = None,
) -> None:
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评价不存在")
    if merchant_id:
        # 商家只能删除自己商品的评价
        product = await db.get(Product, review.product_id)
        if not product or product.merchant_id != merchant_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作")
    if user_id is not None and review.user_id != user_id:
        # 买家只能删除自己的评价（P0-M8：原实现误用 merchant_id 导致买家无法删除）
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作")
    await db.delete(review)
    await db.commit()


async def review_distribution(db: AsyncSession, *, product_id: str) -> dict:
    total = int(await db.scalar(select(func.count(Review.id)).where(Review.product_id == product_id)) or 0)
    dist = {i: 0 for i in range(1, 6)}
    if total == 0:
        return {"product_id": product_id, "total": 0, "average": 0.0, "distribution": dist}
    avg = await db.scalar(select(func.avg(Review.rating)).where(Review.product_id == product_id))
    rows = await db.execute(
        select(Review.rating, func.count(Review.id))
        .where(Review.product_id == product_id)
        .group_by(Review.rating)
    )
    for rating, cnt in rows.all():
        dist[rating] = cnt
    return {
        "product_id": product_id,
        "total": total,
        "average": round(float(avg or 0), 2),
        "distribution": dist,
    }


async def mark_helpful(db: AsyncSession, *, review_id: str, user_id: str) -> Review:
    """标记「有用」（P2-17）。简易计数，不做去重（演示场景足够）。"""
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评价不存在")
    review.helpful_count = (review.helpful_count or 0) + 1
    await db.commit()
    await db.refresh(review, ["user"])
    return review


async def report_review(
    db: AsyncSession, *, review_id: str, user_id: str, reason: str | None
) -> Review:
    """举报评价（P2-17）。累计举报数并记录最近一次原因。"""
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评价不存在")
    review.report_count = (review.report_count or 0) + 1
    if reason:
        review.report_reason = reason
    await db.commit()
    await db.refresh(review, ["user"])
    return review


async def append_review(
    db: AsyncSession,
    *,
    review_id: str,
    user_id: str,
    content: str,
    images: list[str] | None = None,
    video: str | None = None,
) -> Review:
    """买家对已完成的评价发起追评（仅一次）。"""
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="评价不存在")
    if review.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能追评自己的评价")
    if review.append_content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该评价已追评")
    review.append_content = content
    review.append_at = datetime.now(timezone.utc)
    if images:
        review._append_images = json.dumps(images)
    if video:
        review.video = video
    await db.commit()
    await db.refresh(review, ["user"])
    return review
