"""支付网关抽象层（P3-F 支付抽象化）。

设计目标（对齐 2026 资金安全 / 担保交易趋势）：
- 将网关差异收敛到 `PaymentProvider`：沙箱自测、Mock 即时、Stripe 占位。
- 对外接口（下单 / 回调验真 / 退款）保持稳定，切换网关仅改配置 `PAYMENT_GATEWAY`。
- 资金流：买家支付成功后进入「担保托管(held)」；买家确认收货(COMPLETED)才释放给商家(settled)；
  退款则逆向(reversed)。由 `order_service.transition_status` 统一驱动，避免散落各接口。
"""
from __future__ import annotations

import abc
import hashlib
import hmac

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.order import Order
from app.models.payment import Payment


class PaymentProvider(abc.ABC):
    """网关抽象：签名、下单参数、回调验真、退款参数。"""

    name: str = "base"

    # ---- 签名 ----
    def _sign(self, canonical: str) -> str:
        return hmac.new(
            settings.PAYMENT_SECRET.encode("utf-8"),
            canonical.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    @abc.abstractmethod
    def build_charge(self, payment: Payment, order: Order) -> dict:
        """返回唤起支付的参数（跳转地址 / 二维码参数等）。"""

    @abc.abstractmethod
    def verify_webhook(self, payload: dict, payment: Payment | None) -> bool:
        """校验异步回调签名 / 来源，返回是否合法。"""

    @abc.abstractmethod
    def build_refund(self, payment: Payment, amount: float) -> dict:
        """返回退款受理结果（实际资金由原网关原路退回）。"""


class SandboxProvider(PaymentProvider):
    """沙箱自测网关：自签 HMAC，便于前端/测试触发回调。"""

    name = "sandbox"

    def build_charge(self, payment: Payment, order: Order) -> dict:
        canonical = f"{payment.order_id}.{payment.id}.{payment.amount}"
        sign = self._sign(canonical)
        return {
            "payment_id": payment.id,
            "gateway": self.name,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "status": payment.status,
            "pay_url": f"/pay/mock?payment_id={payment.id}&sig={sign}",
        }

    def verify_webhook(self, payload: dict, payment: Payment | None) -> bool:
        order_id = payload.get("order_id")
        transaction_id = payload.get("transaction_id")
        amount = payload.get("amount")
        timestamp = payload.get("timestamp")
        signature = payload.get("signature", "")
        canonical = f"{order_id}.{transaction_id}.{amount}.{timestamp}"
        return hmac_compare(self._sign(canonical), signature)

    def build_refund(self, payment: Payment, amount: float) -> dict:
        return {
            "refund_id": f"RF-{payment.id[:8]}",
            "gateway": self.name,
            "status": "refunded",
            "amount": float(amount),
        }


class StripeProvider(PaymentProvider):
    """Stripe 占位实现：保留同一套签名校验逻辑，生产替换为 stripe 验签密钥。"""

    name = "stripe"

    def build_charge(self, payment: Payment, order: Order) -> dict:
        canonical = f"{payment.order_id}.{payment.id}.{payment.amount}"
        sign = self._sign(canonical)
        return {
            "payment_id": payment.id,
            "gateway": self.name,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "status": payment.status,
            "pay_url": f"https://checkout.stripe.com/mock?payment_id={payment.id}&sig={sign}",
        }

    def verify_webhook(self, payload: dict, payment: Payment | None) -> bool:
        order_id = payload.get("order_id")
        transaction_id = payload.get("transaction_id")
        amount = payload.get("amount")
        timestamp = payload.get("timestamp")
        signature = payload.get("signature", "")
        canonical = f"{order_id}.{transaction_id}.{amount}.{timestamp}"
        return hmac_compare(self._sign(canonical), signature)

    def build_refund(self, payment: Payment, amount: float) -> dict:
        return {
            "refund_id": f"re_{payment.id[:8]}",
            "gateway": self.name,
            "status": "refunded",
            "amount": float(amount),
        }


class MockProvider(PaymentProvider):
    """Mock 即时网关：演示/无密钥环境，下单即成功、回调免验签（仅匹配订单号）。"""

    name = "mock"

    def build_charge(self, payment: Payment, order: Order) -> dict:
        return {
            "payment_id": payment.id,
            "gateway": self.name,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "status": payment.status,
            "pay_url": f"/pay/mock?payment_id={payment.id}",
        }

    def verify_webhook(self, payload: dict, payment: Payment | None) -> bool:
        return bool(payload.get("order_id"))

    def build_refund(self, payment: Payment, amount: float) -> dict:
        return {
            "refund_id": f"MOCK-RF-{payment.id[:8]}",
            "gateway": self.name,
            "status": "refunded",
            "amount": float(amount),
        }


def hmac_compare(expected: str, provided: str) -> bool:
    return hmac.compare_digest(expected, provided or "")


_PROVIDERS: dict[str, type[PaymentProvider]] = {
    "sandbox": SandboxProvider,
    "stripe": StripeProvider,
    "mock": MockProvider,
}


def get_provider(name: str | None = None) -> PaymentProvider:
    """按配置或显式名称返回网关实现；未知网关回退到沙箱。"""
    key = (name or settings.PAYMENT_GATEWAY or "sandbox").lower()
    return _PROVIDERS.get(key, SandboxProvider)()


async def get_order_payment(db: AsyncSession, order_id: str) -> Payment | None:
    return (
        await db.scalars(select(Payment).where(Payment.order_id == order_id))
    ).first()
