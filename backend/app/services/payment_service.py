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
from app.models.order import Order, OrderItem, OrderStatus
from app.models.payment import Payment
from app.models.product import Product
from app.models.user import Role
from app.models.settlement import Settlement
from app.services import order_service
from app.services.payment_providers import get_provider, get_order_payment


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
        return provider.build_charge(payment, order)
    provider = get_provider(payment.gateway)
    charge = provider.build_charge(payment, order)
    payment.raw_data = json.dumps(charge, ensure_ascii=False)
    await db.commit()
    await db.refresh(payment)
    return charge


async def confirm_payment(db: AsyncSession, payment: Payment, order: Order) -> Payment:
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
    provider = get_provider(gateway)
    order_id = payload.get("order_id")
    payment = await get_order_payment(db, order_id)
    if not payment:
        raise ValueError("订单不存在")

    # 验真：非法签名直接拒绝
    if not provider.verify_webhook(payload, payment):
        payment.status = "failed"
        await db.commit()
        await db.refresh(payment)
        raise ValueError("回调签名校验失败")

    if payment.status == "paid":
        # 幂等：重复回调
        existing_order = await db.get(Order, order_id)
        info = await get_payment_status(db, existing_order)
        info["status"] = "already_paid"
        return info

    payment.status = "paid"
    payment.transaction_id = payload.get("transaction_id")
    payment.paid_at = _utcnow()
    payment.escrow_status = "held"  # 担保托管：暂不结算给商家
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
        "released_at": payment.released_at.isoformat() if payment.released_at else None,
    }


async def refund_payment(db: AsyncSession, order: Order) -> Payment:
    payment = await get_or_create_payment(db, order)
    provider = get_provider(payment.gateway)
    res = provider.build_refund(payment, float(payment.amount))
    payment.status = "refunded"
    payment.raw_data = json.dumps(res, ensure_ascii=False)
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
async def release_escrow(db: AsyncSession, order: Order, payment: Payment | None = None) -> Settlement:
    """买家确认收货后释放资金给商家（结算台账置为 settled）。"""
    if payment is None:
        payment = await get_or_create_payment(db, order)
    now = _utcnow()
    payment.escrow_status = "released"
    payment.released_at = now

    settlement = (
        await db.scalars(select(Settlement).where(Settlement.order_id == order.id))
    ).first()
    if not settlement:
        merchant_id = await _order_merchant_id(db, order)
        settlement = Settlement(
            order_id=order.id,
            merchant_id=merchant_id,
            amount=order.total_amount,
            currency="CNY",
            status="settled",
            settled_at=now,
        )
        db.add(settlement)
    else:
        settlement.status = "settled"
        settlement.settled_at = now
    await db.flush()
    return settlement


async def reverse_escrow(db: AsyncSession, order: Order, payment: Payment | None = None) -> None:
    """退款时逆向托管资金（结算台账置为 reversed）。"""
    if payment is None:
        payment = await get_or_create_payment(db, order)
    payment.escrow_status = "reversed"
    payment.released_at = None
    settlement = (
        await db.scalars(select(Settlement).where(Settlement.order_id == order.id))
    ).first()
    if settlement:
        settlement.status = "reversed"
        settlement.settled_at = None


async def _order_merchant_id(db: AsyncSession, order: Order) -> str | None:
    items = (
        await db.scalars(select(OrderItem).where(OrderItem.order_id == order.id))
    ).all()
    if not items:
        return None
    product = await db.get(Product, items[0].product_id)
    return product.merchant_id if product else None
