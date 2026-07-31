"""第 1 批：购物体验三件套回归测试
- P1-3 历史价格曲线（price-history 记录 + 接口）
- P1-5 售后进度可视化（aftersale-timeline）
- P1-6 地址智能解析（离线关键词解析）
"""
import pytest


async def _create_merchant_product(client, headers, price=199.0):
    from sqlalchemy import text as _text
    from app.db.session import SessionLocal

    r = await client.post(
        "/api/products",
        json={
            "name": "B1测试商品",
            "description": "用于第1批功能测试",
            "price": price,
            "stock": 50,
            "category_id": "cat-default",
            "status": "active",
        },
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    async with SessionLocal() as db:
        await db.execute(_text("UPDATE products SET status='ACTIVE' WHERE id=:id"), {"id": pid})
        await db.commit()
    return pid


@pytest.mark.asyncio
async def test_price_history_recorded_and_returned(client, merchant_headers):
    """P1-3：上架记首条，改价记第二条；接口返回升序序列且含 compare。"""
    from sqlalchemy import text as _text
    from app.db.session import SessionLocal

    pid = await _create_merchant_product(client, merchant_headers, price=100.0)
    # 改价到 80（降价），应产生第二条快照
    up = await client.put(
        f"/api/products/{pid}", json={"price": 80.0}, headers=merchant_headers
    )
    assert up.status_code == 200, up.text

    async with SessionLocal() as db:
        n = await db.scalar(_text("SELECT COUNT(*) FROM price_history WHERE product_id=:id"), {"id": pid})
        assert n == 2, f"应记录 2 条价格快照（上架+改价），实际 {n}"

    resp = await client.get(f"/api/products/{pid}/price-history")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    series = body["series"]
    assert len(series) == 2
    assert series[0]["price"] == 100.0 and series[1]["price"] == 80.0
    assert series[0]["time"] <= series[1]["time"]
    assert "compare" in body


@pytest.mark.asyncio
async def test_aftersale_timeline_on_refund(client, buyer_headers, merchant_headers):
    """P1-5：买家申请退款后，时间轴含 refund_requested 事件。"""
    from sqlalchemy import text as _text
    from app.db.session import SessionLocal
    from app.models.order import Order, OrderStatus

    pid = await _create_merchant_product(client, merchant_headers, price=199.0)
    # 下单
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": 1}, headers=buyer_headers)
    co = await client.post(
        "/api/orders/checkout", json={"address": "上海市浦东新区 demo 路 1 号"},
        headers=buyer_headers,
    )
    assert co.status_code in (200, 201), co.text
    oid = co.json()["id"]
    # 支付（sandbox 自助确认）→ 订单转 PAID，方可申请退款
    pay = await client.post(f"/api/payments/orders/{oid}/pay", headers=buyer_headers)
    assert pay.status_code == 200, pay.text
    conf = await client.post(f"/api/payments/orders/{oid}/confirm", headers=buyer_headers)
    assert conf.status_code == 200, conf.text

    # 买家申请退款
    rf = await client.post(
        f"/api/orders/{oid}/refund", json={"reason": "不想要了"}, headers=buyer_headers
    )
    assert rf.status_code == 200, rf.text

    tl = await client.get(f"/api/orders/{oid}/aftersale-timeline", headers=buyer_headers)
    assert tl.status_code == 200, tl.text
    events = tl.json()["events"]
    assert any(e["event_type"] == "refund_requested" for e in events)

    # 商家同意退款 → 应追加 refunded 事件
    ap = await client.patch(
        f"/api/orders/{oid}/refund-review", json={"approve": True, "note": "同意退款"}, headers=merchant_headers
    )
    assert ap.status_code == 200, ap.text
    tl2 = await client.get(f"/api/orders/{oid}/aftersale-timeline", headers=buyer_headers)
    etypes = [e["event_type"] for e in tl2.json()["events"]]
    assert "refund_requested" in etypes and "refunded" in etypes


def test_address_parse_offline():
    """P1-6：离线解析常见地址文本。"""
    from app.services.address_service import parse_address

    r = parse_address("广东省深圳市南山区科技园路 1 号腾讯大厦 5 楼")
    assert r["province"] == "广东省"
    assert r["city"] == "深圳市"
    assert r["district"] == "南山区"
    assert "科技园路 1 号" in r["detail"]
    assert r["confidence"] in ("high", "medium")

    # 直辖市（市==省）
    r2 = parse_address("北京市海淀区中关村大街 27 号")
    assert r2["province"] == "北京市"
    assert r2["district"] == "海淀区"

    # 无省市区
    r3 = parse_address("就随便写的地址")
    assert r3["confidence"] == "low"
