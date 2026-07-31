from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from typing import Optional
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.api._product_snapshot import load_product_map, snapshot_name
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.cart import CartItem
from app.models.product import Product, ProductStatus
from app.models.variant import ProductVariant
from app.models.user import User
from app.models.content import Promotion, PromotionType
from app.schemas.cart import CartItemAdd, CartItemOut, CartItemUpdate
from app.services.audit_service import record

router = APIRouter(prefix="/cart", tags=["cart"])


def _variant_label(variant: Optional[ProductVariant]) -> Optional[str]:
    if not variant:
        return None
    specs = variant.specs_dict()
    if not specs:
        return None
    return " / ".join(f"{k}:{v}" for k, v in specs.items())


async def _effective_price(db: AsyncSession, product: Product) -> tuple[float, bool]:
    """计算加购时的实际成交价：优先取进行中的单品秒杀价，否则原价。

    返回 (成交价, 是否为限时秒杀)。
    """
    now = datetime.now(timezone.utc)
    promo = await db.scalar(
        select(Promotion).where(
            and_(
                Promotion.product_id == product.id,
                Promotion.type == PromotionType.FLASH,
                Promotion.is_active == 1,
                Promotion.start_at.isnot(None),
                Promotion.end_at.isnot(None),
                Promotion.start_at <= now,
                Promotion.end_at >= now,
            )
        )
    )
    if not promo:
        return float(product.price), False
    if promo.discount_price is not None:
        return float(promo.discount_price), True
    if promo.discount_rate is not None:
        return round(float(product.price) * float(promo.discount_rate), 2), True
    return float(product.price), False


def _serialize(
    item: CartItem, snapshot: dict, variant_label: Optional[str] = None, is_flash: bool = False
) -> CartItemOut:
    product = snapshot.get(item.product_id)
    price = item.price if item.price is not None else (product.price if product else 0)
    original = None
    if is_flash and product is not None:
        # 限时秒杀：透传商品原价，供前端以划线价展示，凸显优惠力度
        original = float(product.price)
    return CartItemOut(
        id=item.id,
        product_id=item.product_id,
        name=snapshot_name(snapshot, item.product_id),
        price=price,
        image_url=product.image_url if product else None,
        stock=product.stock if product else 0,
        quantity=item.quantity,
        variant_id=item.variant_id,
        variant_label=variant_label,
        merchant_id=product.merchant_id if product else None,
        category_id=product.category_id if product else None,
        is_flash=is_flash,
        original=original,
    )


@router.get("", response_model=list[CartItemOut])
async def get_cart(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[CartItemOut]:
    rows = list(await db.scalars(select(CartItem).where(CartItem.user_id == user.id)))
    snapshot = await load_product_map(db, [it.product_id for it in rows])
    variant_ids = [it.variant_id for it in rows if it.variant_id]
    variant_map: dict[str, Optional[str]] = {}
    if variant_ids:
        variants = list(
            await db.scalars(
                select(ProductVariant).where(ProductVariant.id.in_(variant_ids))
            )
        )
        for v in variants:
            variant_map[v.id] = _variant_label(v)
    return [
        _serialize(it, snapshot, variant_map.get(it.variant_id), bool(it.is_flash))
        for it in rows
    ]


@router.post("/items", response_model=CartItemOut, status_code=201)
async def add_item(
    data: CartItemAdd,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CartItemOut:
    product = await db.get(Product, data.product_id)
    if not product or product.status != ProductStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不可购买")
    # 校验并锁定库存来源：优先使用规格库存
    variant = None
    if data.variant_id:
        variant = await db.get(ProductVariant, data.variant_id)
        if not variant or variant.product_id != product.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="规格不存在")
        if variant.stock < data.quantity:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="规格库存不足")
    else:
        if product.stock < data.quantity:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="库存不足")
    existing = await db.scalar(
        select(CartItem).where(
            (CartItem.user_id == user.id)
            & (CartItem.product_id == data.product_id)
            & (CartItem.variant_id == data.variant_id)
        )
    )
    if existing:
        new_qty = min(existing.quantity + data.quantity, 99)
        existing.quantity = new_qty
        # 已存在则按最新促销刷新成交价与秒杀标记
        existing.price, existing.is_flash = await _effective_price(db, product)
        await record(db, user.id, "cart.add", "cart", existing.id, f"商品 {product.id} x{new_qty}")
        await db.commit()
        return _serialize(existing, {product.id: product}, _variant_label(variant), bool(existing.is_flash))
    effective_price, is_flash = await _effective_price(db, product)
    item = CartItem(
        user_id=user.id,
        product_id=data.product_id,
        quantity=data.quantity,
        variant_id=data.variant_id,
        price=effective_price,
        is_flash=is_flash,
    )
    db.add(item)
    await record(db, user.id, "cart.add", "cart", item.id, f"商品 {data.product_id} x{data.quantity}")
    await db.commit()
    return _serialize(item, {product.id: product}, _variant_label(variant), is_flash)


@router.put("/items/{item_id}", response_model=CartItemOut)
async def update_item(
    item_id: str,
    data: CartItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CartItemOut:
    item = await db.get(CartItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="购物车项不存在")
    product = await db.get(Product, item.product_id)
    if product and product.stock < data.quantity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="库存不足")
    variant_label = None
    if item.variant_id:
        variant = await db.get(ProductVariant, item.variant_id)
        variant_label = _variant_label(variant)
    item.quantity = data.quantity
    await record(db, user.id, "cart.update", "cart", item.id, f"数量->{data.quantity}")
    await db.commit()
    return _serialize(item, {product.id: product} if product else {}, variant_label, bool(item.is_flash))


@router.delete("/items/{item_id}", status_code=204)
async def remove_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    item = await db.get(CartItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="购物车项不存在")
    await record(db, user.id, "cart.remove", "cart", item.id)
    await db.delete(item)
    await db.commit()


# ---------------------------------------------------------------------------
# P1-2 购物车凑单 / 满减进度
# ---------------------------------------------------------------------------
from app.models.coupon import Coupon, CouponType, UserCoupon
from app.services.promo_engine import (
    apply_item_promotions,
    collect_full_reduce_progress,
)


@router.get("/preview", tags=["cart"])
async def cart_preview(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    """购物车算价预览 + 满减进度（P1-2 凑单提示数据源）。

    返回：subtotal（购物车总和）、item_promo_discount（活动满减/赠品等）、
    item_promo_hits、full_reduce_progress（按商品的满减活动进度，含 gap）、
    coupon_progress（用户可用满减券中最划算一档的还差金额）。
    """
    rows = list(await db.scalars(select(CartItem).where(CartItem.user_id == user.id)))
    if not rows:
        return {
            "subtotal": 0,
            "item_promo_discount": 0,
            "item_promo_hits": [],
            "full_reduce_progress": [],
            "coupon_progress": None,
        }
    snapshot = await load_product_map(db, [it.product_id for it in rows])
    # 还原下单口径的成交价（含秒杀价）用于活动满减判定
    promo_items: list[tuple[str, int, float]] = []
    for it in rows:
        product = snapshot.get(it.product_id)
        price = float(it.price) if it.price is not None else (float(product.price) if product else 0.0)
        promo_items.append((it.product_id, it.quantity, price))
    subtotal = round(sum(q * p for _, q, p in promo_items), 2)

    discount, _gifts, hits = await apply_item_promotions(db, promo_items)
    full_reduce = await collect_full_reduce_progress(db, promo_items)

    # 用户可用满减券中最划算一档的「还差多少」
    owned = list(
        await db.scalars(
            select(UserCoupon)
            .where(UserCoupon.user_id == user.id, UserCoupon.is_used == False)  # noqa: E712
            .join(Coupon, Coupon.id == UserCoupon.coupon_id)
            .where(Coupon.type == CouponType.FULL_REDUCE, Coupon.is_active == True)  # noqa: E712
        )
    )
    coupon_progress = None
    best_gap = None
    for uc in owned:
        c = uc.coupon
        th = float(c.threshold or 0)
        if subtotal < th:
            gap = round(th - subtotal, 2)
            # 选「门槛最低且未达」的券（最容易凑到），作为主提示
            if best_gap is None or gap < best_gap["gap"]:
                coupon_progress = {
                    "user_coupon_id": uc.id,
                    "name": c.name,
                    "threshold": th,
                    "value": float(c.value),
                    "gap": gap,
                }
                best_gap = coupon_progress
    return {
        "subtotal": subtotal,
        "item_promo_discount": discount,
        "item_promo_hits": hits,
        "full_reduce_progress": full_reduce,
        "coupon_progress": coupon_progress,
    }


@router.get("/bundle-suggestions", tags=["cart"])
async def bundle_suggestions(
    gap: float = 0,
    limit: int = 8,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """凑单推荐（P1-2）：基于当前购物车「还差多少」推荐可凑单商品。

    轻量实现：取在售商品中价格落入 [gap*0.8, gap*1.6] 区间（或 gap<=0 时取热门低价），
    按价格升序，返回可一键加购的商品。
    """
    rows = list(await db.scalars(select(CartItem).where(CartItem.user_id == user.id)))
    snapshot = await load_product_map(db, [it.product_id for it in rows])
    cart_total = round(sum(float(it.price or 0) * it.quantity for it in rows), 2)
    target = max(gap, 0)
    q = select(Product).where(Product.status == ProductStatus.ACTIVE)
    if target > 0:
        lo = round(target * 0.8, 2)
        hi = round(target * 1.6, 2)
        q = q.where(Product.price >= lo, Product.price <= hi)
    else:
        q = q.where(Product.price <= 50)
    q = q.order_by(Product.price.asc()).limit(limit)
    products = list(await db.scalars(q))
    result = []
    for p in products:
        # 估算加购该商品后是否可触发满减（基于购物车总额 + 该商品价 vs 最近门槛）
        projected = round(cart_total + float(p.price), 2)
        result.append(
            {
                "id": p.id,
                "name": p.name,
                "price": float(p.price),
                "image_url": p.image_url,
                "merchant_id": p.merchant_id,
                "projected_total": projected,
            }
        )
    return result
