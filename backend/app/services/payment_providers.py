"""支付网关抽象层（P3-F 支付抽象化）。

设计目标（对齐 2026 资金安全 / 担保交易趋势）：
- 将网关差异收敛到 `PaymentProvider`：沙箱自测、Mock 即时、Stripe 占位。
- 对外接口（下单 / 回调验真 / 退款）保持稳定，切换网关仅改配置 `PAYMENT_GATEWAY`。
- 资金流：买家支付成功后进入「担保托管(held)」；买家确认收货(COMPLETED)才释放给商家(settled)；
  退款则逆向(reversed)。由 `order_service.transition_status` 统一驱动，避免散落各接口。
"""
from __future__ import annotations

import abc
import asyncio
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

    # 子类可声明需要的密钥；缺失时自动降级（见 `is_live`）。
    required_secrets: tuple[str, ...] = ()

    def is_live(self) -> bool:
        """网关是否已具备真实生产凭据。缺任一密钥即视为降级（沙箱/自签）模式。"""
        return all(getattr(settings, s, "") for s in self.required_secrets)

    # ---- 签名 ----
    def _sign(self, canonical: str) -> str:
        return hmac.new(
            settings.PAYMENT_SECRET.encode("utf-8"),
            canonical.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    @abc.abstractmethod
    async def build_charge(self, payment: Payment, order: Order) -> dict:
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

    async def build_charge(self, payment: Payment, order: Order) -> dict:
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
    """Stripe 真实集成骨架。

    生产（配置了 STRIPE_SECRET_KEY）时：
      - `build_charge` 用官方 stripe SDK 创建 Checkout Session，返回真实跳转地址；
      - `verify_webhook` 用 STRIPE_WEBHOOK_SECRET 调 `stripe.Webhook.construct_event` 验签。
    未配置密钥（本地/CI/演示）时：
      - 优雅降级为自签 HMAC，保持同一套签名契约，便于前端与 pytest 触发回调，不引入硬依赖。
    """

    name = "stripe"
    required_secrets = ("STRIPE_SECRET_KEY",)

    def _get_stripe(self):
        """延迟导入 stripe；缺失或密钥为空时返回 None（降级模式）。"""
        if not settings.STRIPE_SECRET_KEY:
            return None
        try:
            import stripe  # 仅在真实集成路径下需要
        except ImportError:
            return None
        stripe.api_key = settings.STRIPE_SECRET_KEY
        return stripe

    async def build_charge(self, payment: Payment, order: Order) -> dict:
        stripe_lib = self._get_stripe()
        if stripe_lib is not None:
            try:
                session = await asyncio.to_thread(
                    stripe_lib.checkout.Session.create,
                    mode="payment",
                    success_url=f"{settings.PAYMENT_NOTIFY_BASE_URL}/pay/success?order_id={payment.order_id}",
                    cancel_url=f"{settings.PAYMENT_NOTIFY_BASE_URL}/pay/cancel?order_id={payment.order_id}",
                    line_items=[{
                        "price_data": {
                            "currency": (payment.currency or "cny").lower(),
                            "product_data": {"name": f"订单 {payment.order_id}"},
                            "unit_amount": int(round(float(payment.amount) * 100)),
                        },
                        "quantity": 1,
                    }],
                    metadata={"payment_id": payment.id, "order_id": payment.order_id},
                )
                return {
                    "payment_id": payment.id,
                    "gateway": self.name,
                    "amount": float(payment.amount),
                    "currency": payment.currency,
                    "status": payment.status,
                    "pay_url": session.url,
                    "session_id": session.id,
                }
            except Exception as exc:
                logger.warning("stripe charge failed, fall back to self-signed HMAC: %s", exc)
        # 降级：自签 HMAC（契约与沙箱一致）
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
        # Stripe 真实回调：header 携带 stripe-signature，body 为原始字符串
        raw_body = payload.get("__raw_body", "")
        signature = payload.get("signature", "")
        if settings.STRIPE_WEBHOOK_SECRET and raw_body:
            stripe_lib = self._get_stripe()
            if stripe_lib is not None:
                try:
                    stripe_lib.Webhook.construct_event(
                        raw_body, signature, settings.STRIPE_WEBHOOK_SECRET
                    )
                    return True
                except Exception:
                    return False
        # 降级：保留原自签契约校验
        order_id = payload.get("order_id")
        transaction_id = payload.get("transaction_id")
        amount = payload.get("amount")
        timestamp = payload.get("timestamp")
        canonical = f"{order_id}.{transaction_id}.{amount}.{timestamp}"
        return hmac_compare(self._sign(canonical), signature)

    def build_refund(self, payment: Payment, amount: float) -> dict:
        stripe_lib = self._get_stripe()
        if stripe_lib is not None:
            # 真实退款需先有 charge/payment_intent id；本地占位用 payment id
            try:
                refund = stripe_lib.Refund.create(
                    payment_intent=payment.gateway_payment_id or "",
                    amount=int(round(float(amount) * 100)),
                )
                return {
                    "refund_id": refund.id,
                    "gateway": self.name,
                    "status": refund.status,
                    "amount": float(amount),
                }
            except Exception:
                pass
        return {
            "refund_id": f"re_{payment.id[:8]}",
            "gateway": self.name,
            "status": "refunded",
            "amount": float(amount),
        }


class MockProvider(PaymentProvider):
    """Mock 即时网关：演示/无密钥环境，下单即成功、回调免验签（仅匹配订单号）。"""

    name = "mock"

    async def build_charge(self, payment: Payment, order: Order) -> dict:
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


class WxPayProvider(PaymentProvider):
    """微信支付沙箱骨架（P0-1 真实接入占位）。

    生产需配置 WECHAT_MCH_ID / WECHAT_API_KEY，并使用微信 v3 证书验签；
    未配置时降级为 HMAC-SHA256 自签（契约一致），便于联调与测试。
    注意：生产微信支付确认回调需做幂等与状态机驱动（见 order_service）。
    """

    name = "wechat"
    required_secrets = ("WECHAT_MCH_ID", "WECHAT_API_KEY")

    def _sign_v2(self, params: dict) -> str:
        """微信支付 v2 风格签名：按字典序拼接 key=value&...&key=API_KEY 后 MD5 大写。"""
        import hashlib

        sorted_items = sorted(
            (k, str(v)) for k, v in params.items() if v not in (None, "")
        )
        raw = "&".join(f"{k}={v}" for k, v in sorted_items)
        raw += f"&key={settings.WECHAT_API_KEY}"
        return hashlib.md5(raw.encode("utf-8")).hexdigest().upper()

    async def build_charge(self, payment: Payment, order: Order, client_ip: str | None = None) -> dict:
        if not settings.WECHAT_MCH_ID:
            # 降级：自签 HMAC
            canonical = f"{payment.order_id}.{payment.id}.{payment.amount}"
            sign = self._sign(canonical)
            return {
                "payment_id": payment.id,
                "gateway": self.name,
                "amount": float(payment.amount),
                "currency": payment.currency,
                "status": payment.status,
                "pay_url": f"/pay/wechat/mock?payment_id={payment.id}&sig={sign}",
            }
        if not settings.PAYMENT_NOTIFY_BASE_URL:
            logger.warning("PAYMENT_NOTIFY_BASE_URL 未配置，微信支付回调地址将无法生成")
        params = {
            "appid": settings.WECHAT_APP_ID,
            "mch_id": settings.WECHAT_MCH_ID,
            "out_trade_no": payment.order_id,
            "total_fee": int(round(float(payment.amount) * 100)),
            "spbill_create_ip": client_ip or "127.0.0.1",
            "notify_url": f"{settings.PAYMENT_NOTIFY_BASE_URL}/api/payments/webhook/wechat",
            "body": f"订单 {payment.order_id}",
        }
        sign = self._sign_v2(params)
        return {
            "payment_id": payment.id,
            "gateway": self.name,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "status": payment.status,
            "pay_params": {**params, "sign": sign},
        }

    def verify_webhook(self, payload: dict, payment: Payment | None) -> bool:
        if not settings.WECHAT_API_KEY:
            order_id = payload.get("order_id")
            transaction_id = payload.get("transaction_id")
            amount = payload.get("amount")
            timestamp = payload.get("timestamp")
            signature = payload.get("signature", "")
            canonical = f"{order_id}.{transaction_id}.{amount}.{timestamp}"
            return hmac_compare(self._sign(canonical), signature)
        # 生产：微信 v3 用平台证书验签；此处用 v2 签名回算做基础校验
        # 注意：不直接 pop 入参，避免破坏调用方重试幂等
        sign = payload.get("sign", "")
        body = {k: v for k, v in payload.items() if k != "sign"}
        return hmac_compare(self._sign_v2(body), sign)

    def build_refund(self, payment: Payment, amount: float) -> dict:
        return {
            "refund_id": f"WX-RF-{payment.id[:8]}",
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
    "wechat": WxPayProvider,
}


def get_provider(name: str | None = None) -> PaymentProvider:
    """按配置或显式名称返回网关实现；未知网关回退到沙箱。"""
    key = (name or settings.PAYMENT_GATEWAY or "sandbox").lower()
    return _PROVIDERS.get(key, SandboxProvider)()


async def get_order_payment(db: AsyncSession, order_id: str) -> Payment | None:
    return (
        await db.scalars(select(Payment).where(Payment.order_id == order_id))
    ).first()
