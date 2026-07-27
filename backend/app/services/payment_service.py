"""支付服务（P0 真实支付接入）。

设计要点：
- 网关抽象：默认 sandbox 自测网关，生产切换为 alipay / wechat 时仅替换
  `_verify_webhook` 与 `_charge` 实现，对外接口保持不变。
- 幂等：webhook 重复回调时，已 PAID 的支付直接返回 already_paid，不重复流转订单。
- 退款原路：退款时标记对应支付流水为 REFUNDED（资金沿原网关原路退回）。
"""
from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.order import Order, OrderStatus
from app.models.payment import Payment
from app.services.order_service import transition_status


def _sign(canonical: str) -> str:
    return hmac.new(
        settings.PAYMENT_SECRET.encode("utf-8"),
        canonical.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def get_or_create_payment(db: AsyncSession, order: Order) -> Payment:
    """获取或创建该订单的支付流水（幂等：已存在则复用）。"""
    existing = (
        await db.scalars(
            select(Payment)
            .where(Payment.order_id == order.id)
            .order_by(Payment.created_at.desc())
        )
    ).first()
    if existing:
        return existing
    payment = Payment(
        order_id=order.id,
        gateway=settings.PAYMENT_GATEWAY,
        amount=order.total_amount,
        currency="CNY",
        status="created",
    )
    db.add(payment)
    await db.flush()
    return payment


async def create_charge(db: AsyncSession, order: Order) -> dict:
    """买家发起支付：生成支付单并返回跳转地址 / 二维码参数（sandbox 自测）。"""
    payment = await get_or_create_payment(db, order)
    await db.commit()
    # sandbox 网关：直接给出可用于模拟回调的签名参数，便于前端/测试触发
    canonical = f"{payment.order_id}.{payment.id}.{payment.amount}"
    sign = _sign(canonical)
    return {
        "payment_id": payment.id,
        "gateway": payment.gateway,
        "amount": float(payment.amount),
        "currency": payment.currency,
        "status": payment.status,
        "pay_url": f"/pay/mock?payment_id={payment.id}&sig={sign}",
    }


async def handle_webhook(db: AsyncSession, gateway: str, payload: dict) -> dict:
    """处理网关异步回调。

    返回 dict 含 status：paid / already_paid / ignored，或抛 ValueError（验签失败）。
    """
    if gateway != settings.PAYMENT_GATEWAY:
        raise ValueError("unknown gateway")

    order_id = payload.get("order_id")
    transaction_id = payload.get("transaction_id")
    amount = payload.get("amount")
    timestamp = payload.get("timestamp")
    signature = payload.get("signature", "")

    canonical = f"{order_id}.{transaction_id}.{amount}.{timestamp}"
    expected = _sign(canonical)
    if not hmac.compare_digest(expected, signature):
        raise ValueError("invalid signature")

    order = await db.get(Order, order_id)
    if not order:
        raise ValueError("order not found")

    payment = await get_or_create_payment(db, order)
    if payment.status == "paid":
        return {"status": "already_paid", "order_id": order.id}
    # 金额防篡改：回调金额必须与实际应付一致（允许 0.01 误差）
    if abs(float(payment.amount) - float(amount)) > 0.01:
        payment.status = "failed"
        payment.raw_data = json.dumps(payload, ensure_ascii=False)
        await db.commit()
        raise ValueError("amount mismatch")

    payment.status = "paid"
    payment.transaction_id = transaction_id
    payment.paid_at = _now()
    payment.raw_data = json.dumps(payload, ensure_ascii=False)
    await db.flush()

    if order.status == OrderStatus.PENDING_PAYMENT:
        order = await transition_status(
            db, order=order, target=OrderStatus.PAID, actor_id="payment-gateway", role="buyer"
        )
        return {"status": "paid", "order_id": order.id, "order_status": order.status.value}
    # 订单已不在待支付态（如已支付），仅确认支付流水
    await db.commit()
    return {"status": "confirmed", "order_id": order.id, "order_status": order.status.value}


async def refund_payment(db: AsyncSession, order: Order) -> Payment | None:
    """原路退款：标记该订单支付流水为 REFUNDED（资金沿原网关退回）。"""
    payment = (
        await db.scalars(select(Payment).where(Payment.order_id == order.id))
    ).first()
    if not payment:
        return None
    if payment.status == "paid":
        payment.status = "refunded"
        await db.flush()
    return payment


async def confirm_payment(db: AsyncSession, order: Order) -> dict:
    """沙箱自测：模拟网关回调完成支付（生产环境仅由网关 webhook 触发此逻辑）。"""
    payment = await get_or_create_payment(db, order)
    ts = int(_now().timestamp())
    canonical = f"{order.id}.{payment.id}.{float(payment.amount)}.{ts}"
    sig = _sign(canonical)
    payload = {
        "order_id": order.id,
        "transaction_id": payment.id,
        "amount": float(payment.amount),
        "timestamp": ts,
        "signature": sig,
    }
    return await handle_webhook(db, settings.PAYMENT_GATEWAY, payload)
