import hashlib
import hmac

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.order import Order, OrderStatus
from app.models.payment import Payment
from app.models.product import Product, ProductStatus
from app.services.payment_service import refund_payment


def _sign(canonical: str) -> str:
    return hmac.new(
        settings.PAYMENT_SECRET.encode(), canonical.encode(), hashlib.sha256
    ).hexdigest()


@pytest.mark.asyncio
async def test_payment_capture_and_idempotency(client, buyer_headers, merchant_headers):
    bh, mh = buyer_headers, merchant_headers
    prod = await client.post(
        "/api/products",
        headers=mh,
        json={"name": "支付测试商品", "price": 50, "stock": 10, "category_id": None},
    )
    assert prod.status_code == 201, prod.text
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()

    await client.post(
        "/api/shipping-templates",
        headers=mh,
        json={"name": "默认运费", "base_fee": 5, "free_amount": 0, "is_default": True},
    )
    await client.post("/api/cart/items", headers=bh, json={"product_id": pid, "quantity": 1})
    co = await client.post(
        "/api/orders/checkout", headers=bh, json={"address": "支付测试收货地址"}
    )
    assert co.status_code in (200, 201), co.text
    oid = co.json()["id"]

    # 发起支付
    pay = await client.post(f"/api/payments/orders/{oid}/pay", headers=bh)
    assert pay.status_code == 200, pay.text
    data = pay.json()
    assert data["status"] == "created"
    amount = data["amount"]

    # 构造网关回调（带签名）
    ts = 1700000000
    sig = _sign(f"{oid}.TXN1.{amount}.{ts}")
    payload = {
        "order_id": oid,
        "transaction_id": "TXN1",
        "amount": amount,
        "timestamp": ts,
        "signature": sig,
    }
    wh = await client.post("/api/payments/webhook/sandbox", json=payload)
    assert wh.status_code == 200, wh.text
    assert wh.json()["status"] == "paid"

    async with SessionLocal() as s:
        o = await s.get(Order, oid)
        assert o.status == OrderStatus.PAID

    # 幂等：重复回调直接返回 already_paid
    wh2 = await client.post("/api/payments/webhook/sandbox", json=payload)
    assert wh2.status_code == 200
    assert wh2.json()["status"] == "already_paid"

    st = await client.get(f"/api/payments/orders/{oid}/status", headers=bh)
    assert st.status_code == 200
    assert st.json()["status"] == "paid"
    assert st.json()["transaction_id"] == "TXN1"


@pytest.mark.asyncio
async def test_payment_webhook_bad_signature(client, buyer_headers, merchant_headers):
    bh, mh = buyer_headers, merchant_headers
    prod = await client.post(
        "/api/products",
        headers=mh,
        json={"name": "支付签名商品", "price": 30, "stock": 10, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    await client.post(
        "/api/shipping-templates",
        headers=mh,
        json={"name": "默认运费2", "base_fee": 5, "free_amount": 0, "is_default": True},
    )
    await client.post("/api/cart/items", headers=bh, json={"product_id": pid, "quantity": 1})
    co = await client.post(
        "/api/orders/checkout", headers=bh, json={"address": "支付签名测试地址"}
    )
    oid = co.json()["id"]

    payload = {
        "order_id": oid,
        "transaction_id": "TXN9",
        "amount": 30,
        "timestamp": 1,
        "signature": "deadbeef",
    }
    wh = await client.post("/api/payments/webhook/sandbox", json=payload)
    assert wh.status_code == 400


@pytest.mark.asyncio
async def test_refund_marks_payment_refunded(client, buyer_headers, merchant_headers):
    bh, mh = buyer_headers, merchant_headers
    prod = await client.post(
        "/api/products",
        headers=mh,
        json={"name": "支付退款商品", "price": 40, "stock": 10, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    await client.post(
        "/api/shipping-templates",
        headers=mh,
        json={"name": "默认运费3", "base_fee": 5, "free_amount": 0, "is_default": True},
    )
    await client.post("/api/cart/items", headers=bh, json={"product_id": pid, "quantity": 1})
    co = await client.post(
        "/api/orders/checkout", headers=bh, json={"address": "支付退款测试地址"}
    )
    oid = co.json()["id"]

    pay = await client.post(f"/api/payments/orders/{oid}/pay", headers=bh)
    amount = pay.json()["amount"]
    ts = 1700000000
    sig = _sign(f"{oid}.TXN1.{amount}.{ts}")
    await client.post(
        "/api/payments/webhook/sandbox",
        json={
            "order_id": oid,
            "transaction_id": "TXN1",
            "amount": amount,
            "timestamp": ts,
            "signature": sig,
        },
    )

    async with SessionLocal() as s:
        o = await s.get(Order, oid)
        await refund_payment(s, o)
        await s.commit()
        p = (await s.scalars(select(Payment).where(Payment.order_id == oid))).first()
        assert p.status == "refunded"
