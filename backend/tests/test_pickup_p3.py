"""P3-D 物流轨迹 + 到店自提：自提免运费、支付生成自提码、商家核销完成、发货自动轨迹。"""
import hashlib
import hmac

import pytest

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus


def _sign(canonical: str) -> str:
    return hmac.new(
        settings.PAYMENT_SECRET.encode(), canonical.encode(), hashlib.sha256
    ).hexdigest()


async def _prepare_product(client, mh, name="自提测试商品", price=50, stock=10):
    r = await client.post(
        "/api/products",
        headers=mh,
        json={"name": name, "price": price, "stock": stock, "category_id": None},
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    # 建一个收费运费模板，验证自提能豁免运费
    await client.post(
        "/api/shipping-templates",
        headers=mh,
        json={"name": "自提运费模板", "base_fee": 8, "free_amount": 0, "is_default": True},
    )
    return pid


async def _pay(client, oid):
    pay = await client.post(f"/api/payments/orders/{oid}/pay")
    # buyer_headers 由调用方在 client 上下文外提供，此函数不用
    return pay


@pytest.mark.asyncio
async def test_pickup_order_free_freight_and_code(client, buyer_headers, merchant_headers):
    bh, mh = buyer_headers, merchant_headers
    pid = await _prepare_product(client, mh)

    await client.post("/api/cart/items", headers=bh, json={"product_id": pid, "quantity": 1})
    co = await client.post(
        "/api/orders/checkout",
        headers=bh,
        json={"address": "到店自提-联系电话13800000000", "delivery_type": "pickup", "pickup_store": "旗舰店（中山路店）"},
    )
    assert co.status_code == 201, co.text
    body = co.json()
    oid = body["id"]
    assert body["delivery_type"] == "pickup"
    assert body["pickup_store"] == "旗舰店（中山路店）"
    assert float(body["freight"]) == 0.0  # 自提免运费
    assert not body.get("pickup_code")  # 未支付无自提码

    # 支付后生成自提码
    pay = await client.post(f"/api/payments/orders/{oid}/pay", headers=bh)
    assert pay.status_code == 200, pay.text
    amount = pay.json()["amount"]
    import time; ts = int(time.time())
    sig = _sign(f"{oid}.TXNPICK.{amount}.{ts}")
    wh = await client.post(
        "/api/payments/webhook/sandbox",
        json={"order_id": oid, "transaction_id": "TXNPICK", "amount": amount, "timestamp": ts, "signature": sig},
    )
    assert wh.status_code == 200, wh.text

    detail = await client.get(f"/api/orders/{oid}", headers=bh)
    body = detail.json()
    assert body["status"] == "paid"
    code = body["pickup_code"]
    assert code and len(code) == 8

    # 错误自提码被拒绝
    bad = await client.post(
        f"/api/orders/{oid}/pickup-verify", headers=mh, json={"pickup_code": "WRONG123"}
    )
    assert bad.status_code == 400

    # 正确核销：订单直接完成，记录核销时间
    ok = await client.post(
        f"/api/orders/{oid}/pickup-verify", headers=mh, json={"pickup_code": code}
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["status"] == "completed"
    assert body["picked_up_at"] is not None

    # 物流轨迹含备货与核销事件
    lg = await client.get(f"/api/orders/{oid}/logistics", headers=bh)
    assert lg.status_code == 200
    descs = "".join(e["description"] for e in lg.json()["events"])
    assert "自提" in descs and "核销" in descs


@pytest.mark.asyncio
async def test_pickup_requires_store(client, buyer_headers, merchant_headers):
    bh, mh = buyer_headers, merchant_headers
    pid = await _prepare_product(client, mh, name="自提缺门店商品")
    await client.post("/api/cart/items", headers=bh, json={"product_id": pid, "quantity": 1})
    co = await client.post(
        "/api/orders/checkout",
        headers=bh,
        json={"address": "到店自提-联系电话13800000000", "delivery_type": "pickup"},
    )
    assert co.status_code == 400


@pytest.mark.asyncio
async def test_express_ship_auto_trace(client, buyer_headers, merchant_headers):
    bh, mh = buyer_headers, merchant_headers
    pid = await _prepare_product(client, mh, name="快递轨迹商品")
    await client.post("/api/cart/items", headers=bh, json={"product_id": pid, "quantity": 1})
    co = await client.post(
        "/api/orders/checkout", headers=bh, json={"address": "上海市浦东新区测试路 1 号"}
    )
    assert co.status_code == 201, co.text
    oid = co.json()["id"]
    assert co.json()["delivery_type"] == "express"
    assert float(co.json()["freight"]) == 8.0  # 快递照常计运费

    pay = await client.post(f"/api/payments/orders/{oid}/pay", headers=bh)
    amount = pay.json()["amount"]
    import time; ts = int(time.time())
    sig = _sign(f"{oid}.TXNEXP.{amount}.{ts}")
    await client.post(
        "/api/payments/webhook/sandbox",
        json={"order_id": oid, "transaction_id": "TXNEXP", "amount": amount, "timestamp": ts, "signature": sig},
    )

    # 商家发货：自动生成首条揽收轨迹
    ship = await client.patch(f"/api/orders/{oid}/status", headers=mh, json={"status": "shipped"})
    assert ship.status_code == 200, ship.text
    lg = await client.get(f"/api/orders/{oid}/logistics", headers=bh)
    events = lg.json()["events"]
    assert len(events) >= 1
    assert "商家发出" in events[0]["description"] or "发出" in events[0]["description"]

    # 商家补充轨迹节点
    add = await client.post(
        f"/api/orders/{oid}/logistics",
        headers=mh,
        json={
            "tracking_no": "SF123456789",
            "event": {"time": "2026-07-28T10:00:00Z", "location": "上海转运中心", "description": "快件到达上海转运中心"},
        },
    )
    assert add.status_code == 200, add.text
    lg2 = await client.get(f"/api/orders/{oid}/logistics", headers=bh)
    assert lg2.json()["tracking_no"] == "SF123456789"
    assert len(lg2.json()["events"]) == len(events) + 1

    # 快递订单不可核销自提码
    bad = await client.post(
        f"/api/orders/{oid}/pickup-verify", headers=mh, json={"pickup_code": "ANYCODE1"}
    )
    assert bad.status_code == 400
