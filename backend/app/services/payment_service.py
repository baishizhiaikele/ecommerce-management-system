"""支付服务（P3-F：支付抽象化 + 担保交易）。

关键不变量：
- 下单(create_charge) 与 退款(refund) 经 `PaymentProvider` 抽象，网关差异被收敛。
- 支付成功(paid) 时资金进入「托管(held)」，不立即结算给商家。
- 买家确认收货(COMPLETED) 触发 `release_escrow` 释放资金(settled)；退款触发 `reverse_escrow`(reversed)。
- 回调幂等：重复回调直接返回已处理状态。
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.utils.time import iso_utc
from app.models.order import Order, OrderItem, OrderStatus
from app.models.payment import Payment
from app.models.product import Product
from app.models.user import Role
from app.models.settlement import Settlement
from app.services import order_service
from app.services.payment_providers import get_provider, get_order_payment
from app.core.metrics import inc_counter


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def get_or_create_payment(db: AsyncSession, order: Order) -> Payment:
    existing = (
        await db.scalars(select(Payment).where(Payment.order_id == order.id))
    ).first()
    if existing:
        return existing
    payment = Payment(
        order_id=order.id,
        gateway=settings.PAYMENT_GATEWAY or "sandbox",
        amount=order.total_amount,
        currency="CNY",
        status="created",
    )
    db.add(payment)
    await db.flush()
    return payment


async def create_charge(db: AsyncSession, order: Order) -> dict:
    payment = await get_or_create_payment(db, order)
    if payment.status != "created":
        provider = get_provider(payment.gateway)
        return await provider.build_charge(payment, order)
    provider = get_provider(payment.gateway)
    charge = await provider.build_charge(payment, order)
    payment.raw_data = json.dumps(charge, ensure_ascii=False)
    await db.commit()
    await db.refresh(payment)
    return charge


async def confirm_payment(db: AsyncSession, order: Order) -> Payment:
    payment = await get_or_create_payment(db, order)
    provider = get_provider(payment.gateway)
    ts = int(_utcnow().timestamp())
    payload = {
        "order_id": order.id,
        "transaction_id": f"TXN-{payment.id[:8]}",
        "amount": float(payment.amount),
        "timestamp": ts,
        "signature": provider._sign(f"{order.id}.TXN-{payment.id[:8]}.{float(payment.amount)}.{ts}"),
    }
    return await handle_webhook(db, payment.gateway, payload)


async def handle_webhook(db: AsyncSession, gateway: str, payload: dict) -> Payment:
    """处理支付网关异步回调。

    安全不变量（P0-F1/F2 修复）：
    - 网关以 DB 中 payment.gateway 为准，URL 参数仅做一致性校验（防伪造网关注入）。
    - 金额必须与支付单一致（防 0.01 元支付千元订单）。
    - 时间戳必须在 ±5 分钟内（防重放）。
    - 已终态（paid/refunded）不再推进（防退款后重放回调重复放款）。
    """
    # P0-F1：先用 strict 模式校验 URL 传入的 gateway 是否合法
    try:
        get_provider(gateway, strict=True)
    except ValueError as e:
        raise ValueError(f"回调网关不合法: {e}")

    order_id = payload.get("order_id")
    payment = await get_order_payment(db, order_id)
    if not payment:
        raise ValueError("订单不存在")

    # P0-F1：网关必须以 DB 记录为准，防止 URL 注入伪造网关
    if gateway != payment.gateway:
        raise ValueError(f"回调网关({gateway})与支付单网关({payment.gateway})不一致")

    provider = get_provider(payment.gateway)

    # 验真：非法签名直接拒绝
    if not provider.verify_webhook(payload, payment):
        inc_counter("webhook_signature_failures")
        raise ValueError("回调签名校验失败")

    # P0-F2：金额校验，防止金额不匹配的回调
    payload_amount = float(payload.get("amount", 0))
    payment_amount = float(payment.amount)
    if abs(payload_amount - payment_amount) > 0.01:
        inc_counter("webhook_signature_failures")
        raise ValueError(f"回调金额({payload_amount})与支付单({payment_amount})不匹配")

    # P0-F2：时间戳时效校验（±5 分钟），防重放
    ts = payload.get("timestamp")
    if ts is not None:
        try:
            ts_val = int(ts)
            now_ts = int(_utcnow().timestamp())
            if abs(now_ts - ts_val) > 300:
                raise ValueError(f"回调时间戳({ts_val})已过期，当前时间({now_ts})")
        except (TypeError, ValueError):
            raise ValueError("回调时间戳格式无效")

    # P0-F2：已终态不再推进（防退款后重放回调）
    if payment.status in ("paid", "refunded"):
        info = await get_payment_status(db, await db.get(Order, order_id))
        info["status"] = "already_processed"
        return info

    # P0-F2：transaction_id 防重放 —— 同一 transaction_id 不可重复处理
    txn_id = payload.get("transaction_id")
    if txn_id:
        from sqlalchemy import select as _sel
        dup = (await db.scalars(_sel(Payment).where(Payment.transaction_id == txn_id))).first()
        if dup and dup.id != payment.id:
            raise ValueError(f"交易号 {txn_id} 已被支付单 {dup.id} 使用")

    payment.status = "paid"
    payment.transaction_id = txn_id
    payment.paid_at = _utcnow()
    payment.escrow_status = "held"  # 担保托管：暂不结算给商家
    inc_counter("payments_succeeded")
    payment.raw_data = json.dumps(payload, ensure_ascii=False)

    order = await db.get(Order, order_id)
    if order and order.status == OrderStatus.PENDING_PAYMENT:
        await order_service.transition_status(
            db,
            order=order,
            target=OrderStatus.PAID,
            actor_id=order.buyer_id,
            role=Role.BUYER,
        )
    await db.commit()
    await db.refresh(payment)
    return await get_payment_status(db, order)


async def get_payment_status(db: AsyncSession, order: Order) -> dict:
    payment = await get_order_payment(db, order.id)
    if not payment:
        return {
            "status": "none",
            "escrow_status": "none",
            "gateway": None,
            "payment_id": None,
            "transaction_id": None,
            "released_at": None,
        }
    return {
        "payment_id": payment.id,
        "gateway": payment.gateway,
        "amount": float(payment.amount),
        "status": payment.status,
        "escrow_status": payment.escrow_status,
        "transaction_id": payment.transaction_id,
        "released_at": iso_utc(payment.released_at),
    }


async def refund_payment(db: AsyncSession, order: Order) -> Payment:
    payment = await get_or_create_payment(db, order)
    # 幂等：已退款直接返回，避免重复退款
    if payment.status == "refunded":
        return payment
    # 仅已支付订单可退款；未支付订单凭空退款会造成资损
    if payment.status != "paid":
        raise ValueError("仅已支付订单可申请退款")
    provider = get_provider(payment.gateway)
    # P0-C4：退款金额以实付金额 payment.amount 为上限，并与 order.refund_amount 交叉校验
    refund_amount = float(order.refund_amount or 0)
    payment_amount = float(payment.amount)
    if refund_amount <= 0:
        refund_amount = payment_amount
    # 夹紧：退款金额不超过实付金额
    refund_amount = max(0.0, min(refund_amount, payment_amount))
    if refund_amount <= 0:
        raise ValueError("该订单无可退金额")
    res = provider.build_refund(payment, refund_amount)
    payment.status = "refunded"
    payment.raw_data = json.dumps(res, ensure_ascii=False)
    inc_counter("payments_refunded")
    # 逆向托管资金
    await reverse_escrow(db, order, payment)
    await db.commit()
    await db.refresh(payment)
    return payment


async def refund_order_for_user(db: AsyncSession, order_id: str) -> Payment:
    order = await db.get(Order, order_id)
    if not order:
        raise ValueError("订单不存在")
    return await refund_payment(db, order)


# ---------- 担保交易：资金释放 / 逆向 ----------
async def release_escrow(db: AsyncSession, order: Order, payment: Payment | None = None) -> list[Settlement]:
    """买家确认收货后释放资金给商家（结算台账置为 settled）。多商家订单按商家分别结算。"""
    if payment is None:
        payment = await get_or_create_payment(db, order)
    now = _utcnow()
    payment.escrow_status = "released"
    payment.released_at = now

    # 多商家订单：按商家分别结算，避免货款全进首个商家
    merchant_amounts = await _order_merchant_subtotals(db, order)
    settlements: list[Settlement] = []
    if not merchant_amounts:
        # 兜底：无商品明细时整单结算给首个商家（兼容历史数据）
        merchant_amounts = {await _order_merchant_id(db, order): float(order.total_amount)}
    for merchant_id, amount in merchant_amounts.items():
        settlement = (
            await db.scalars(
                select(Settlement).where(
                    Settlement.order_id == order.id, Settlement.merchant_id == merchant_id
                )
            )
        ).first()
        if not settlement:
            settlement = Settlement(
                order_id=order.id,
                merchant_id=merchant_id,
                amount=amount,
                currency="CNY",
                status="settled",
                settled_at=now,
            )
            db.add(settlement)
        else:
            settlement.status = "settled"
            settlement.settled_at = now
            settlement.amount = amount
        settlements.append(settlement)
    await db.flush()
    return settlements


async def reverse_escrow(db: AsyncSession, order: Order, payment: Payment | None = None) -> None:
    """退款时逆向托管资金（结算台账置为 reversed）。撤销该订单下所有商家结算记录。"""
    if payment is None:
        payment = await get_or_create_payment(db, order)
    payment.escrow_status = "reversed"
    payment.released_at = None
    # 多商家订单可能有多条结算记录，逐条逆向
    settlements = (
        await db.scalars(select(Settlement).where(Settlement.order_id == order.id))
    ).all()
    for settlement in settlements:
        settlement.status = "reversed"
        settlement.settled_at = None


async def _order_merchant_subtotals(db: AsyncSession, order: Order) -> dict[str, float]:
    """按商家拆分订单货款：多商家订单需分别给各商家结算。

    P0-C3 修复：按各商家小计占比分摊 discount_amount，平台不再因优惠券净亏损。
    返回 {merchant_id: 该商家应结算金额(已分摊优惠)}。
    """
    items = (
        await db.scalars(select(OrderItem).where(OrderItem.order_id == order.id))
    ).all()
    if not items:
        return {}
    products = (
        await db.scalars(
            select(Product).where(Product.id.in_([it.product_id for it in items]))
        )
    ).all()
    pmap = {p.id: p for p in products}
    # 计算各商家原始小计
    raw: dict[str, float] = {}
    for it in items:
        product = pmap.get(it.product_id)
        mid = product.merchant_id if product else None
        if not mid:
            continue
        raw[mid] = raw.get(mid, 0.0) + float(it.price) * it.quantity
    # P0-C3：按小计占比分摊优惠，保证 sum(settlements) <= payment.amount
    subtotal_total = sum(raw.values())
    if subtotal_total <= 0:
        return {}
    discount = float(getattr(order, "discount_amount", 0) or 0)
    discount_ratio = max(0.0, 1.0 - discount / subtotal_total) if subtotal_total > 0 else 1.0
    return {mid: round(amt * discount_ratio, 2) for mid, amt in raw.items()}
