"""P3-A 退货退款重建测试：退货退款（需商家收货确认）、仅退款、换货、平台仲裁。"""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _buy_new_order(client, buyer_headers, merchant_headers) -> str:
    me = await client.get("/api/auth/me", headers=merchant_headers)
    mid = me.json()["id"]
    pid = (await client.get(f"/api/products?merchant_id={mid}")).json()[0]["id"]
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": 1}, headers=buyer_headers)
    order = (await client.post(
        "/api/orders/checkout", json={"address": "P3 退货测试 12345"}, headers=buyer_headers
    )).json()
    return order["id"]


async def test_return_refund_requires_merchant_receipt(client, buyer_headers, merchant_headers):
    """已发货订单：退款必须以买家寄回 + 商家确认收货为前提（2026 退货退款合规）。"""
    oid = await _buy_new_order(client, buyer_headers, merchant_headers)
    await client.patch(f"/api/orders/{oid}/status", json={"status": "paid"}, headers=buyer_headers)
    await client.patch(f"/api/orders/{oid}/status", json={"status": "shipped"}, headers=merchant_headers)

    r = await client.post(f"/api/orders/{oid}/refund", json={"reason": "质量问题"}, headers=buyer_headers)
    assert r.status_code in (200, 201), r.text
    assert r.json()["status"] == "return_requested"  # 已发货→退货，而非仅退款

    # 商家不能直接在未收货时打款
    early = await client.patch(f"/api/orders/{oid}/refund-review", json={"approve": True}, headers=merchant_headers)
    assert early.status_code == 400, early.text

    ship = await client.post(
        f"/api/orders/{oid}/return-ship",
        json={"tracking_no": "SF999", "carrier": "顺丰", "note": "已寄出"},
        headers=buyer_headers,
    )
    assert ship.status_code in (200, 201), ship.text
    assert ship.json()["status"] == "return_shipped"
    assert ship.json()["return_tracking_no"] == "SF999"

    rec = await client.post(f"/api/orders/{oid}/return-receive", headers=merchant_headers)
    assert rec.status_code == 200, rec.text
    assert rec.json()["status"] == "return_received"

    rev = await client.patch(f"/api/orders/{oid}/refund-review", json={"approve": True}, headers=merchant_headers)
    assert rev.status_code == 200, rev.text
    assert rev.json()["status"] == "refunded"


async def test_unshipped_refund_only(client, buyer_headers, merchant_headers):
    """未发货订单：平台直接仅退款，无需退货。

    注意：当订单金额 <= AUTO_REFUND_MAX_AMOUNT(100) 时，未发货仅退款会被自动秒退，
    申请退款后状态直接为 refunded（无需人工审核）；否则为 refund_requested，可人工审核。
    """
    oid = await _buy_new_order(client, buyer_headers, merchant_headers)
    await client.patch(f"/api/orders/{oid}/status", json={"status": "paid"}, headers=buyer_headers)

    r = await client.post(f"/api/orders/{oid}/refund", json={"reason": "不想要了"}, headers=buyer_headers)
    state = r.json()["status"]
    assert state in ("refund_requested", "refunded")

    # 仅在未自动秒退时验证人工审核链路
    if state == "refund_requested":
        rev = await client.patch(f"/api/orders/{oid}/refund-review", json={"approve": True}, headers=merchant_headers)
        assert rev.json()["status"] == "refunded"


async def test_exchange_flow(client, buyer_headers, merchant_headers):
    oid = await _buy_new_order(client, buyer_headers, merchant_headers)
    await client.patch(f"/api/orders/{oid}/status", json={"status": "paid"}, headers=buyer_headers)
    await client.patch(f"/api/orders/{oid}/status", json={"status": "shipped"}, headers=merchant_headers)
    await client.post(f"/api/orders/{oid}/refund", json={"reason": "尺码不对"}, headers=buyer_headers)
    await client.post(f"/api/orders/{oid}/return-ship", json={"tracking_no": "SF1", "carrier": "顺丰"}, headers=buyer_headers)
    await client.post(f"/api/orders/{oid}/return-receive", headers=merchant_headers)
    exc = await client.post(f"/api/orders/{oid}/exchange", json={"note": "换大码"}, headers=merchant_headers)
    assert exc.status_code == 200, exc.text
    assert exc.json()["status"] == "exchange"
    done = await client.patch(f"/api/orders/{oid}/status", json={"status": "completed"}, headers=buyer_headers)
    assert done.json()["status"] == "completed"


async def test_dispute_flow(client, buyer_headers, merchant_headers, admin_headers):
    oid = await _buy_new_order(client, buyer_headers, merchant_headers)
    await client.patch(f"/api/orders/{oid}/status", json={"status": "paid"}, headers=buyer_headers)
    await client.patch(f"/api/orders/{oid}/status", json={"status": "shipped"}, headers=merchant_headers)
    await client.post(f"/api/orders/{oid}/refund", json={"reason": "争议"}, headers=buyer_headers)
    d = await client.post(f"/api/orders/{oid}/dispute", json={"reason": "商家不处理"}, headers=buyer_headers)
    assert d.status_code in (200, 201), d.text
    assert d.json()["status"] == "dispute"
    # 仅管理员可裁定
    by_merchant = await client.post(f"/api/orders/{oid}/dispute-review", json={"approve": True}, headers=merchant_headers)
    assert by_merchant.status_code == 403
    verdict = await client.post(f"/api/orders/{oid}/dispute-review", json={"approve": True}, headers=admin_headers)
    assert verdict.status_code == 200, verdict.text
    assert verdict.json()["status"] == "refunded"
