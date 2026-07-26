from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cart import CartItem
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product, ProductStatus
from app.models.variant import ProductVariant
import json
from app.models.sequence import OrderSequence
from app.models.user import User
from app.models.points import PointAction
from app.state_machine import can_transition
from app.services.audit_service import record
from app.services.coupon_service import compute_discount, find_usable_user_coupon, use_coupon
from app.services.inventory_service import record_cancel_return, record_sale
from app.services.points_service import POINTS_REDEEM_RATE, add_points
from app.events import bus


async def _next_order_no(db: AsyncSession) -> str:
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    seq = await db.scalar(select(OrderSequence).where(OrderSequence.day == day).with_for_update())
    if seq is None:
        seq = OrderSequence(day=day, value=0)
        db.add(seq)
        await db.flush()
    seq.value += 1
    return f"ORD-{day}-{seq.value:04d}"


async def checkout(
    db: AsyncSession,
    *,
    buyer: User,
    address: str,
    coupon_id: str | None = None,
    use_points: bool = False,
) -> Order:
    cart_rows = list(
        await db.scalars(select(CartItem).where(CartItem.user_id == buyer.id))
    )
    if not cart_rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="购物车为空")

    order_no = await _next_order_no(db)
    order = Order(
        order_no=order_no,
        buyer_id=buyer.id,
        status=OrderStatus.PENDING_PAYMENT,
        address=address,
    )
    db.add(order)
    await db.flush()

    # S3：一次性加行锁（FOR UPDATE）取出本次下单涉及的全部商品，既消除 N+1（P1），
    # 又避免并发下单同时读到同一库存值导致的超卖
    product_ids = [it.product_id for it in cart_rows]
    locked = list(
        await db.scalars(
            select(Product).where(Product.id.in_(product_ids)).with_for_update()
        )
    )
    pmap = {p.id: p for p in locked}

    total = 0.0
    out_of_stock: list[str] = []
    for item in cart_rows:
        product = pmap.get(item.product_id)
        if not product or product.status != ProductStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"商品「{product.name if product else item.product_id}」不可购买",
            )
        unit_price = float(product.price)
        variant = None
        if getattr(item, "variant_id", None):
            variant = await db.get(ProductVariant, item.variant_id)
            if not variant or variant.product_id != product.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="商品规格无效"
                )
            if variant.stock < item.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"规格「{variant.sku_code or '该规格'}」库存不足",
                )
            unit_price = float(product.price) + float(variant.price_delta or 0)
            variant.stock -= item.quantity
        if product.stock < item.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"商品「{product.name}」库存不足",
            )
        await record_sale(db, product, item.quantity)
        if product.stock == 0:
            out_of_stock.append(product.id)
        total += unit_price * item.quantity
        variant_info = None
        if variant is not None:
            variant_info = json.dumps(
                {"variant_id": variant.id, "specs": variant.specs_dict()}, ensure_ascii=False
            )
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                quantity=item.quantity,
                price=unit_price,
                variant_info=variant_info,
            )
        )

    subtotal = round(total, 2)
    discount = 0.0
    # 优惠券抵扣
    if coupon_id:
        uc = await find_usable_user_coupon(db, buyer.id, coupon_id)
        if not uc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="优惠券不可用")
        coupon_discount = compute_discount(uc.coupon, subtotal)
        if coupon_discount <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="优惠券不满足使用条件")
        discount += coupon_discount
        await use_coupon(db, uc)
    # 积分抵扣（100 积分抵 1 元）
    if use_points and buyer.points:
        points_used = min(buyer.points, int(subtotal * 100))
        if points_used:
            discount += points_used / POINTS_REDEEM_RATE
            await add_points(db, buyer.id, PointAction.REDEEM, -points_used, "下单积分抵扣")

    order.total_amount = round(max(subtotal - discount, 0.0), 2)
    order.discount_amount = round(discount, 2)
    for item in cart_rows:
        await db.delete(item)
    await record(db, buyer.id, "order.checkout", "order", order.id, order.order_no)
    await db.commit()
    await db.refresh(order)
    # 解耦的库存告警：库存归零时广播事件，由事件处理器异步记录
    for pid in out_of_stock:
        await bus.publish("product.out_of_stock", product_id=pid)
    return order


async def _load_order(db: AsyncSession, order_id: str) -> Order:
    order = await db.scalar(
        select(Order).where(Order.id == order_id).options(selectinload(Order.items))
    )
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在")
    return order


async def list_orders(
    db: AsyncSession, *, user_id: str, role: str
) -> list[Order]:
    stmt = select(Order)
    if role == "merchant":
        stmt = (
            stmt.join(OrderItem, OrderItem.order_id == Order.id)
            .join(Product, Product.id == OrderItem.product_id)
            .where(Product.merchant_id == user_id)
            .distinct()
        )
    else:
        stmt = stmt.where(Order.buyer_id == user_id)
    rows = await db.scalars(stmt.order_by(Order.created_at.desc()))
    return list(rows)


async def get_order(db: AsyncSession, order_id: str, *, user_id: str, role: str) -> Order:
    order = await _load_order(db, order_id)
    if role == "admin":
        return order
    if order.buyer_id != user_id:
        if role == "merchant":
            merchant_items = []
            for it in order.items:
                product = await db.get(Product, it.product_id)
                if product and product.merchant_id == user_id:
                    merchant_items.append(it)
            if not merchant_items:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该订单")
            return order
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该订单")
    return order


async def transition_status(
    db: AsyncSession, *, order: Order, target: OrderStatus, actor_id: str, role: str
) -> Order:
    if not can_transition(order.status, target, role):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不允许从 {order.status.value} 流转到 {target.value}",
        )
    now = datetime.now(timezone.utc)
    order.status = target
    if target == OrderStatus.PAID:
        order.paid_at = now
    elif target == OrderStatus.SHIPPED:
        order.shipped_at = now
    elif target == OrderStatus.COMPLETED:
        order.completed_at = now
        for it in order.items:
            product = await db.get(Product, it.product_id)
            if product:
                product.sales_count = (product.sales_count or 0) + it.quantity
    elif target == OrderStatus.CANCELLED:
        for it in order.items:
            product = await db.get(Product, it.product_id)
            if product:
                await record_cancel_return(db, product, it.quantity)
    elif target == OrderStatus.REFUNDED:
        for it in order.items:
            product = await db.get(Product, it.product_id)
            if product:
                await record_cancel_return(db, product, it.quantity)
                product.sales_count = max((product.sales_count or 0) - it.quantity, 0)

    await record(db, actor_id, f"order.{target.value}", "order", order.id, order.order_no)
    await db.commit()
    await db.refresh(order)

    # 解耦：完成后发积分 / 通知；退款后回收积分
    if target == OrderStatus.COMPLETED:
        await bus.publish("order.completed", order_id=order.id, buyer_id=order.buyer_id)
    elif target == OrderStatus.REFUNDED:
        await bus.publish("order.refunded", order_id=order.id, buyer_id=order.buyer_id)
    return order
