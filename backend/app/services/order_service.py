import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import DeadlockDetectedError
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
from app.services.promo_engine import apply_item_promotions
from app.services.coupon_service import compute_discount, find_usable_user_coupon, use_coupon

logger = logging.getLogger(__name__)


async def _db_now(db: AsyncSession) -> datetime:
    """L7：以数据库时间为权威时钟，避免多实例部署时各应用服务器时钟偏差
    导致订单超时判定与状态时间戳（paid_at/shipped_at/completed_at/
    picked_up_at）相互矛盾。PostgreSQL 返回带时区 UTC；SQLite 返回
    CURRENT_TIMESTAMP（naive），此处统一补全为 UTC 以兼容带时区字段。
    """
    dt = await db.scalar(select(func.current_timestamp()))
    if dt is None:  # 兜底：DB 函数异常时不应阻断下单/状态流转
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt
from app.services.inventory_service import record_cancel_return, record_sale
from app.services.points_service import POINTS_REDEEM_RATE, add_points
from app.services.shipping_service import compute_freight
from app.core.member_levels import get_tier
from app.services.plus_service import PLUS_EXTRA_DISCOUNT, is_plus_active
from app.events import bus


async def _next_order_no(db: AsyncSession) -> str:
    day = (await _db_now(db)).strftime("%Y%m%d")
    seq = await db.scalar(select(OrderSequence).where(OrderSequence.day == day).with_for_update())
    if seq is None:
        seq = OrderSequence(day=day, value=0)
        db.add(seq)
        await db.flush()
    seq.value += 1
    return f"ORD-{day}-{seq.value:04d}"


async def _build_order_items(
    db: AsyncSession,
    *,
    order: Order,
    cart_rows: list[CartItem],
    pmap: dict[str, Product],
) -> tuple[float, dict[str, float], list[tuple[str, int, float]], list[str]]:
    """遍历购物车逐件校验库存/规格、扣减库存并记录销量，生成 OrderItem；
    同时累加金额小计、各商家小计与促销输入。返回 (total, merchant_subtotals, promo_input, out_of_stock)。
    调用方需已对涉及商品加行锁（with_for_update），此处直接扣减以保证不超卖。"""
    total = 0.0
    merchant_subtotals: dict[str, float] = {}
    out_of_stock: list[str] = []
    promo_input: list[tuple[str, int, float]] = []
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
        promo_input.append((product.id, item.quantity, unit_price))
        merchant_subtotals[product.merchant_id] = (
            merchant_subtotals.get(product.merchant_id, 0.0) + unit_price * item.quantity
        )
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
    return total, merchant_subtotals, promo_input, out_of_stock


async def _apply_promotions_and_discounts(
    db: AsyncSession,
    *,
    buyer: User,
    order: Order,
    pmap: dict[str, Product],
    subtotal: float,
    promo_input: list[tuple[str, int, float]],
    tier: dict[str, float | bool],
    plus_active: bool,
    coupon_id: str | None = None,
    use_points: bool = False,
) -> float:
    """汇总所有优惠（商品促销 / 会员等级 / PLUS / 优惠券 / 积分），返回总抵扣金额。
    赠品 OrderItem、优惠券核销、积分扣减等副作用均在此完成，与下单主事务同提交。"""
    discount = 0.0
    # 商品级促销：第二件半价 / N 元任选 M 件 / 满赠（与会员折扣、优惠券叠加）
    promo_discount, gift_ids, _ = await apply_item_promotions(db, promo_input)
    discount += promo_discount
    for gid in gift_ids:
        gift_product = pmap.get(gid) or await db.get(Product, gid)
        if (
            gift_product
            and gift_product.status == ProductStatus.ACTIVE
            and gift_product.stock >= 1
        ):
            await record_sale(db, gift_product, 1)
            db.add(OrderItem(order_id=order.id, product_id=gid, quantity=1, price=0))
    # 会员等级专属折扣（青铜 discount=1.0 不打折）
    discount += round(subtotal * (1 - tier["discount"]), 2)
    # P3-H PLUS 付费会员：全场额外 95 折（与等级折扣叠加）
    if plus_active:
        discount += round(subtotal * tier["discount"] * (1 - PLUS_EXTRA_DISCOUNT), 2)
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
    return discount


async def _compute_freight(
    db: AsyncSession,
    *,
    merchant_subtotals: dict[str, float],
    tier: dict[str, float | bool],
    plus_active: bool,
    delivery_type: str,
) -> float:
    """按各商家默认模板分别计运费后累加；会员包邮权益、PLUS、到店自提均免运费。"""
    freight = 0.0
    for mid, msub in merchant_subtotals.items():
        freight += await compute_freight(db, mid, msub)
    freight = round(freight, 2)
    if tier["free_shipping"] or plus_active:
        freight = 0.0
    if delivery_type == "pickup":
        freight = 0.0
    return freight


async def checkout(
    db: AsyncSession,
    *,
    buyer: User,
    address: str,
    coupon_id: str | None = None,
    use_points: bool = False,
    delivery_type: str = "express",
    pickup_store: str | None = None,
) -> Order:
    cart_rows = list(
        await db.scalars(select(CartItem).where(CartItem.user_id == buyer.id))
    )
    if not cart_rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="购物车为空")

    # P1-M13：锁定买家行，避免并发下单超扣积分
    buyer = await db.scalar(select(User).where(User.id == buyer.id).with_for_update())
    if not buyer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")

    order_no = await _next_order_no(db)
    if delivery_type == "pickup" and not pickup_store:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="到店自提需选择门店")
    order = Order(
        order_no=order_no,
        buyer_id=buyer.id,
        status=OrderStatus.PENDING_PAYMENT,
        address=address,
        delivery_type=delivery_type,
        pickup_store=pickup_store,
    )
    db.add(order)
    await db.flush()

    # S3/P1-M4：排序 + 去重加行锁取出全部涉及商品，消除 N+1 并避免并发超卖/死锁
    product_ids = sorted(set(it.product_id for it in cart_rows))
    locked = list(
        await db.scalars(
            select(Product).where(Product.id.in_(product_ids)).with_for_update()
        )
    )
    pmap = {p.id: p for p in locked}

    # 库存锁定 + 构建订单明细
    total, merchant_subtotals, promo_input, out_of_stock = await _build_order_items(
        db, order=order, cart_rows=cart_rows, pmap=pmap
    )
    subtotal = round(total, 2)

    # 会员等级 / PLUS 状态（优惠与运费均依赖，仅计算一次复用）
    tier = get_tier(buyer.growth_value or 0)
    plus_active = await is_plus_active(db, buyer.id)

    # 优惠计算（含赠品、优惠券、积分等副作用）
    discount = await _apply_promotions_and_discounts(
        db,
        buyer=buyer,
        order=order,
        pmap=pmap,
        subtotal=subtotal,
        promo_input=promo_input,
        tier=tier,
        plus_active=plus_active,
        coupon_id=coupon_id,
        use_points=use_points,
    )

    # 运费计算
    freight = await _compute_freight(
        db,
        merchant_subtotals=merchant_subtotals,
        tier=tier,
        plus_active=plus_active,
        delivery_type=delivery_type,
    )

    order.freight = freight
    order.total_amount = round(max(subtotal - discount, 0.0) + freight, 2)
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
    db: AsyncSession, *, user_id: str, role: str, status: str | None = None,
    page: int = 1, page_size: int = 200,
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
    if status:
        stmt = stmt.where(Order.status == status)
    # P2-M6：服务端分页，避免一次性加载整张订单表
    page_size = min(max(page_size, 1), 500)
    stmt = stmt.limit(page_size).offset(max(page - 1, 0) * page_size)
    rows = await db.scalars(stmt.order_by(Order.created_at.desc()))
    return list(rows)


async def get_order(db: AsyncSession, order_id: str, *, user_id: str, role: str) -> Order:
    order = await _load_order(db, order_id)
    if role == "admin":
        return order
    if order.buyer_id != user_id:
        if role == "merchant":
            # P2-M5：批量预取订单内商品，避免逐 item 查库的 N+1
            item_pids = [it.product_id for it in order.items]
            pmap = {
                p.id: p
                for p in await db.scalars(select(Product).where(Product.id.in_(item_pids)))
            }
            merchant_items = [
                it
                for it in order.items
                if pmap.get(it.product_id) and pmap[it.product_id].merchant_id == user_id
            ]
            if not merchant_items:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该订单")
            return order
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权查看该订单")
    return order


async def transition_status(
    db: AsyncSession, *, order: Order, target: OrderStatus, actor_id: str, role: str
) -> Order:
    prev = order.status
    if not can_transition(prev, target, role):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"不允许从 {order.status.value} 流转到 {target.value}",
    )
    now = await _db_now(db)
    # P2-M5：批量预取订单内商品，避免各状态分支逐 item 查库的 N+1
    _pids = [it.product_id for it in order.items]
    _pmap = {
        p.id: p
        for p in await db.scalars(select(Product).where(Product.id.in_(_pids)))
    }
    order.status = target
    if target == OrderStatus.PAID:
        order.paid_at = now
        # P3-D 到店自提：支付成功即生成核销自提码
        if order.delivery_type == "pickup" and not order.pickup_code:
            order.pickup_code = uuid4().hex[:8].upper()
    elif target == OrderStatus.SHIPPED:
        order.shipped_at = now
        # P3-D 自动写入首条物流轨迹（自提为备货通知，快递为揽收事件）
        trace = json.loads(order.logistics or "[]")
        if order.delivery_type == "pickup":
            desc = f"商品已备货，请携自提码到「{order.pickup_store or '门店'}」自提"
        else:
            desc = f"包裹已由商家发出{('，运单号 ' + order.tracking_no) if order.tracking_no else ''}"
        trace.append(
            {"time": now.isoformat(), "location": order.pickup_store or "商家仓库", "description": desc}
        )
        order.logistics = json.dumps(trace, ensure_ascii=False)
    elif target == OrderStatus.COMPLETED and prev != OrderStatus.EXCHANGE:
        # 换货完成后不重复累加销量（首次完成时已计）
        order.completed_at = now
        for it in order.items:
            product = _pmap.get(it.product_id)
            if product:
                product.sales_count = (product.sales_count or 0) + it.quantity
        # 担保交易：买家确认收货，释放托管资金给商家
        from app.services.payment_service import release_escrow

        await release_escrow(db, order)
    elif target == OrderStatus.CANCELLED:
        for it in order.items:
            product = _pmap.get(it.product_id)
            if product:
                await record_cancel_return(db, product, it.quantity)
    elif target == OrderStatus.REFUND_REQUESTED:
        order.return_requested_at = now
    elif target == OrderStatus.RETURN_SHIPPED:
        order.return_shipped_at = now
    elif target == OrderStatus.RETURN_RECEIVED:
        # 实物已退回：回补库存并扣减销量（打款在 REFUNDED 时不重复回补）
        order.return_received_at = now
        for it in order.items:
            product = _pmap.get(it.product_id)
            if product:
                await record_cancel_return(db, product, it.quantity)
                product.sales_count = max((product.sales_count or 0) - it.quantity, 0)
    elif target == OrderStatus.EXCHANGE:
        order.exchange_at = now
    elif target == OrderStatus.REFUNDED:
        # 仅"未发货仅退款"需要回补库存；已退货的库存已在 RETURN_RECEIVED 回补
        if prev == OrderStatus.REFUND_REQUESTED:
            for it in order.items:
                product = await db.get(Product, it.product_id)
                if product:
                    await record_cancel_return(db, product, it.quantity)
                    product.sales_count = max((product.sales_count or 0) - it.quantity, 0)
        # 担保交易：退款逆向托管资金
        from app.services.payment_service import reverse_escrow

        await reverse_escrow(db, order)
    # DISPUTE: dispute_reason 由 API 设置，无需在此处理

    # M4：状态变更与其审计记录在同一事务内一次性提交，保证二者原子一致；
    # 任何异常（含死锁）均回滚，避免"状态已落库而审计缺失"或会话残留脏状态。
    try:
        await record(db, actor_id, f"order.{target.value}", "order", order.id, order.order_no)
        await db.commit()
    except DeadlockDetectedError:
        await db.rollback()
        logger.warning("订单 %s 状态流转(%s)遇死锁，已回滚", order.id, target.value)
        raise
    except Exception:
        await db.rollback()
        raise

    # 解耦：完成后发积分 / 通知；退款后回收积分
    if target == OrderStatus.COMPLETED:
        await bus.publish("order.completed", order_id=order.id, buyer_id=order.buyer_id)
    elif target == OrderStatus.REFUNDED:
        await bus.publish("order.refunded", order_id=order.id, buyer_id=order.buyer_id)
    elif target == OrderStatus.RETURN_RECEIVED:
        await bus.publish("order.return_received", order_id=order.id, buyer_id=order.buyer_id)
    elif target == OrderStatus.DISPUTE:
        await bus.publish("order.dispute_opened", order_id=order.id, buyer_id=order.buyer_id)
    return order


async def verify_pickup(
    db: AsyncSession, *, order: Order, pickup_code: str, actor_id: str
) -> Order:
    """P3-D 商家核销自提码：备货中(shipped)订单凭码完成履约。"""
    if order.delivery_type != "pickup":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="非自提订单无需核销")
    if order.status not in (OrderStatus.PAID, OrderStatus.SHIPPED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前订单状态不可核销")
    if not order.pickup_code or pickup_code.strip().upper() != order.pickup_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="自提码不正确")
    now = await _db_now(db)
    # 已支付但未备货的订单先流转到 shipped（备货完成）再核销
    if order.status == OrderStatus.PAID:
        order = await transition_status(
            db, order=order, target=OrderStatus.SHIPPED, actor_id=actor_id, role="merchant"
        )
    order.picked_up_at = now
    trace = json.loads(order.logistics or "[]")
    trace.append(
        {
            "time": now.isoformat(),
            "location": order.pickup_store or "门店",
            "description": "买家到店出示自提码，商家核销完成",
        }
    )
    order.logistics = json.dumps(trace, ensure_ascii=False)
    # 核销即买家当面确认收货：以买家身份完成订单（触发托管释放/积分）
    order = await transition_status(
        db, order=order, target=OrderStatus.COMPLETED, actor_id=order.buyer_id, role="buyer"
    )
    return order
