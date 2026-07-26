from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.content import Promotion, PromotionType
from app.models.product import Product
from app.models.user import Role, User
from app.schemas.content import PromotionCreate, PromotionOut

router = APIRouter(prefix="/promotions", tags=["promotions"])


@router.get("", response_model=list[PromotionOut])
async def list_promotions(
    db: AsyncSession = Depends(get_db),
    type: PromotionType | None = Query(None, description="flash|discount|full_reduce"),
    active_only: bool = True,
) -> list:
    """促销活动列表（公开），默认只返回进行中的活动。"""
    stmt = select(Promotion)
    if type:
        stmt = stmt.where(Promotion.type == type)
    if active_only:
        stmt = stmt.where(Promotion.is_active == 1)
    stmt = stmt.order_by(Promotion.created_at.desc())
    rows = await db.scalars(stmt)

    result: list[PromotionOut] = []
    for p in rows:
        item = PromotionOut.model_validate(p)
        item.is_active = p.is_active == 1
        if p.product_id:
            prod = await db.get(Product, p.product_id)
            if prod:
                item.product_name = prod.name
                item.product_image = prod.image_url
                item.original_price = prod.price
        result.append(item)
    return result


@router.get("/mine", response_model=list[PromotionOut])
async def my_promotions(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list:
    """商家查看自己商品的促销活动。"""
    products = (await db.scalars(select(Product).where(Product.merchant_id == user.id))).all()
    pids = [p.id for p in products]
    if not pids:
        return []
    rows = (
        await db.scalars(
            select(Promotion)
            .where(Promotion.product_id.in_(pids))
            .order_by(Promotion.created_at.desc())
        )
    ).all()
    result = []
    for p in rows:
        item = PromotionOut.model_validate(p)
        item.is_active = p.is_active == 1
        prod = next((x for x in products if x.id == p.product_id), None)
        if prod:
            item.product_name = prod.name
            item.product_image = prod.image_url
            item.original_price = prod.price
        result.append(item)
    return result


@router.post("", response_model=PromotionOut, status_code=201)
async def create_promotion(
    data: PromotionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> PromotionOut:
    """商家为自己的商品创建促销活动（秒杀 / 折扣 / 满减）。"""
    product = await db.get(Product, data.product_id)
    if not product or product.merchant_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="商品不存在或不属于你",
        )
    promo = Promotion(
        title=data.title,
        type=data.type,
        product_id=data.product_id,
        discount_price=data.discount_price,
        discount_rate=data.discount_rate,
        start_at=data.start_at,
        end_at=data.end_at,
        is_active=1 if data.is_active else 0,
    )
    db.add(promo)
    await db.commit()
    await db.refresh(promo)
    item = PromotionOut.model_validate(promo)
    item.is_active = promo.is_active == 1
    return item


@router.delete("/{promotion_id}", status_code=204)
async def delete_promotion(
    promotion_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> None:
    """商家删除自己商品的促销活动。"""
    promo = await db.get(Promotion, promotion_id)
    if not promo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="活动不存在")
    if promo.product_id:
        product = await db.get(Product, promo.product_id)
        if product and product.merchant_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除该活动")
    await db.delete(promo)
    await db.commit()
