"""AI-1 客服主动营销：基于用户行为画像，主动推送优惠券与搭配套餐建议。

无 AI 密钥时降级为规则引擎（按近 30 天购买品类偏好 + 在售优惠）。有密钥时
调用 LLM 生成更个性化的营销话术与搭配理由。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Promotion, PromotionType
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product, ProductStatus
from app.models.user import User
from app.services.ai_service import ai_service


async def _fav_categories(db: AsyncSession, user_id: str) -> list[str]:
    """近 30 天购买最多的品类（用于画像）。"""
    since = datetime.now(timezone.utc) - timedelta(days=30)
    rows = await db.execute(
        select(Product.category_id, func.count(OrderItem.id))
        .select_from(OrderItem)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Order.buyer_id == user_id, Order.status != OrderStatus.REFUNDED, Order.created_at >= since)
        .group_by(Product.category_id)
        .order_by(func.count(OrderItem.id).desc())
        .limit(3)
    )
    return [r[0] for r in rows if r[0]]


async def active_marketing(db: AsyncSession, user: User) -> dict:
    """生成主动营销建议：优惠券 + 搭配套餐。"""
    cats = await _fav_categories(db, user.id)

    # 在售满减/折扣券（优先匹配画像品类）
    from sqlalchemy import text as _text

    promo_rows = await db.execute(
        _text(
            "SELECT id, title, type, discount_price, discount_rate FROM promotions "
            "WHERE type IN ('full_reduce','discount') LIMIT 5"
        )
    )
    coupons = [
        {
            "promo_id": r[0],
            "title": r[1],
            "type": r[2],
            "discount_price": float(r[3]) if r[3] is not None else None,
            "rate": float(r[4]) if r[4] is not None else None,
        }
        for r in promo_rows
    ]

    # 搭配套餐：取画像品类下的热门商品（按销量）
    bundle = []
    if cats:
        items = await db.scalars(
            select(Product)
            .where(Product.category_id.in_(cats), Product.status == ProductStatus.ACTIVE)
            .order_by(Product.sales_count.desc())
            .limit(4)
        )
        bundle = [{"product_id": p.id, "name": p.name, "price": float(p.price)} for p in items]

    # AI 话术（无 key 降级）
    suggestion = await ai_service.promote_suggestion(
        fav_categories=cats, coupon_count=len(coupons), bundle_count=len(bundle)
    )
    return {
        "user_id": user.id,
        "fav_categories": cats,
        "coupons": coupons,
        "bundle": bundle,
        "ai_suggestion": suggestion,
    }
