"""P3-F 担保交易：支付托管 -> 确认收货释放 -> 退款逆向。"""
import hashlib
import hmac

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.order import Order, OrderStatus
from app.models.payment import Payment
from app.models.product import Product, ProductStatus
from app.models.settlement import Settlement


def _sign(canonical: str) -> str:
    return hmac.new(
        settings.PAYMENT_SECRET.encode(), canonical.encode(), hashlib.sha256
    ).hexdigest()


async def _create_paid_order(client, bh, mh):
    prod = await client.post(
        "/api/products",
        headers=mh,
        json={"name": "担保测试商品", "price": 60, "stock": 5, "category_id": None},
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
    co = await client.post("/api/orders/checkout", headers=bh, json={"address": "担保测试地址"})
    assert co.status_code in (200, 201), co.text
    oid = co.json()["id"]

    # 发起支付，拿到待签名金额（与 test_payments 一致）
    pay = await client.post(f"/api/payments/orders/{oid}/pay", headers=bh)
    assert pay.status_code == 200, pay.text
    amount = pay.json()["amount"]

    # 沙箱网关回调：资金进入托管
    ts = 1700000000
    sig = _sign(f"{oid}.TXN1.{amount}.{ts}")
    wh = await client.post(
        "/api/payments/webhook/sandbox",
        json={
            "order_id": oid,
            "transaction_id": "TXN1",
            "amount": amount,
            "timestamp": ts,
            "signature": sig,
        },
    )
    assert wh.status_code == 200, wh.text
    return oid, amount


@pytest.mark.asyncio
async def test_escrow_hold_then_release_on_confirm(client, buyer_headers, merchant_headers):
    bh, mh = buyer_headers, merchant_headers
    oid, _ = await _create_paid_order(client, bh, mh)

    async with SessionLocal() as s:
        pay = (await s.scalars(select(Payment).where(Payment.order_id == oid))).first()
        assert pay.status == "paid"
        assert pay.escrow_status == "held"  # 支付成功即托管，不立即结算

    # 商家发货 -> 买家确认收货
    ship = await client.patch(f"/api/orders/{oid}/status", headers=mh, json={"status": "shipped"})
    assert ship.status_code == 200, ship.text
    confirm = await client.patch(f"/api/orders/{oid}/status", headers=bh, json={"status": "completed"})
    assert confirm.status_code == 200, confirm.text

    async with SessionLocal() as s:
        pay = (await s.scalars(select(Payment).where(Payment.order_id == oid))).first()
        assert pay.escrow_status == "released"  # 确认收货后释放给商家
        settle = (await s.scalars(select(Settlement).where(Settlement.order_id == oid))).first()
        assert settle is not None
        assert settle.status == "settled"
        assert settle.settled_at is not None

    # 商家可查到自己的结算台账
    st = await client.get("/api/payments/settlements", headers=mh)
    assert st.status_code == 200, st.text
    ids = [row["order_id"] for row in st.json()]
    assert oid in ids


@pytest.mark.asyncio
async def test_escrow_reversed_on_refund(client, buyer_headers, merchant_headers):
    bh, mh = buyer_headers, merchant_headers
    oid, _ = await _create_paid_order(client, bh, mh)

    # 未发货仅退款：买家申请 -> 商家通过
    refund = await client.post(
        f"/api/orders/{oid}/refund", headers=bh, json={"reason": "不想要了"}
    )
    assert refund.status_code in (200, 201), refund.text
    review = await client.patch(
        f"/api/orders/{oid}/refund-review", headers=mh, json={"approve": True}
    )
    assert review.status_code == 200, review.text

    async with SessionLocal() as s:
        pay = (await s.scalars(select(Payment).where(Payment.order_id == oid))).first()
        assert pay.status == "refunded"
        assert pay.escrow_status == "reversed"  # 退款逆向托管
        settle = (await s.scalars(select(Settlement).where(Settlement.order_id == oid))).first()
        if settle:
            assert settle.status == "reversed"
