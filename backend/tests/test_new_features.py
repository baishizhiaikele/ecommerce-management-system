"""新增功能测试：优惠券、积分、个性化推荐、店铺、退款工单、物流追踪。"""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _merchant_product_id(client, merchant_headers: dict) -> str:
    """取一个归属于当前商家账号的商品 id（种子数据含多个商家）。"""
    me = await client.get("/api/auth/me", headers=merchant_headers)
    mid = me.json()["id"]
    prods = await client.get(f"/api/products?merchant_id={mid}")
    return prods.json()[0]["id"]


async def test_coupon_claim_and_mine(client, buyer_headers):
    coupons = await client.get("/api/coupons")
    assert coupons.status_code == 200
    data = coupons.json()
    assert isinstance(data, list) and len(data) >= 1
    cid = data[0]["id"]

    # 领取（幂等：种子数据可能已为买家领取过）
    claimed = await client.post(f"/api/coupons/{cid}/claim", headers=buyer_headers)
    assert claimed.status_code in (200, 201, 400), claimed.text

    mine = await client.get("/api/coupons/mine", headers=buyer_headers)
    assert mine.status_code == 200
    assert any(c["coupon_id"] == cid for c in mine.json())


async def test_points_awarded_after_completion(client, buyer_headers, merchant_headers):
    pid = await _merchant_product_id(client, merchant_headers)
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": 1}, headers=buyer_headers)
    order = (await client.post(
        "/api/orders/checkout", json={"address": "测试地址 12345"}, headers=buyer_headers
    )).json()
    order_id = order["id"]
    for target, h in (("paid", buyer_headers), ("shipped", merchant_headers), ("completed", buyer_headers)):
        r = await client.patch(f"/api/orders/{order_id}/status", json={"status": target}, headers=h)
        assert r.status_code == 200, r.text

    me = await client.get("/api/auth/me", headers=buyer_headers)
    assert me.status_code == 200
    assert me.json()["points"] > 0


async def test_recommendations_and_shops(client, buyer_headers):
    rec = await client.get("/api/recommendations", headers=buyer_headers)
    assert rec.status_code == 200
    assert isinstance(rec.json(), list)

    shops = await client.get("/api/shops")
    assert shops.status_code == 200
    assert isinstance(shops.json(), list) and len(shops.json()) >= 1
    sid = shops.json()[0]["id"]
    detail = await client.get(f"/api/shops/{sid}")
    assert detail.status_code == 200
    assert "products" in detail.json()


async def test_refund_workflow(client, buyer_headers, merchant_headers):
    pid = await _merchant_product_id(client, merchant_headers)
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": 1}, headers=buyer_headers)
    order = (await client.post(
        "/api/orders/checkout", json={"address": "退款测试 12345"}, headers=buyer_headers
    )).json()
    order_id = order["id"]
    await client.patch(f"/api/orders/{order_id}/status", json={"status": "paid"}, headers=buyer_headers)

    req = await client.post(
        f"/api/orders/{order_id}/refund", json={"reason": "不想要了"}, headers=buyer_headers
    )
    assert req.status_code in (200, 201), req.text
    assert req.json()["status"] == "refund_requested"

    review = await client.patch(
        f"/api/orders/{order_id}/refund-review", json={"approve": True}, headers=merchant_headers
    )
    assert review.status_code == 200, review.text
    assert review.json()["status"] == "refunded"


async def test_logistics_tracking(client, buyer_headers, merchant_headers):
    pid = await _merchant_product_id(client, merchant_headers)
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": 1}, headers=buyer_headers)
    order = (await client.post(
        "/api/orders/checkout", json={"address": "物流测试 12345"}, headers=buyer_headers
    )).json()
    order_id = order["id"]
    await client.patch(f"/api/orders/{order_id}/status", json={"status": "paid"}, headers=buyer_headers)

    add = await client.post(
        f"/api/orders/{order_id}/logistics",
        json={"tracking_no": "SF123", "event": {"time": "now", "location": "深圳", "description": "已揽收"}},
        headers=merchant_headers,
    )
    assert add.status_code == 200, add.text
    assert add.json()["tracking_no"] == "SF123"

    get = await client.get(f"/api/orders/{order_id}/logistics", headers=buyer_headers)
    assert get.status_code == 200
    assert get.json()["events"][0]["description"] == "已揽收"


async def test_merchant_report_export(client, merchant_headers):
    r = await client.get("/api/merchant/reports/orders", headers=merchant_headers)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/csv")


async def test_admin_audit_stats(client, admin_headers):
    r = await client.get("/api/admin/audit-stats", headers=admin_headers)
    assert r.status_code == 200, r.text
    assert "by_action" in r.json()
