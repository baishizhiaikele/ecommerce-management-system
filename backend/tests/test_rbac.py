"""基于角色的访问控制（RBAC）测试：未登录 401、越权 403。"""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_buyer_cannot_change_product_status(client, buyer_headers):
    """买家无权修改商品上架状态，应 403。"""
    pid = (await client.get("/api/products")).json()[0]["id"]
    r = await client.patch(f"/api/products/{pid}/status", json={"status": "active"}, headers=buyer_headers)
    assert r.status_code == 403, r.text


async def test_buyer_cannot_access_admin_dashboard(client, buyer_headers):
    r = await client.get("/api/admin/dashboard/stats", headers=buyer_headers)
    assert r.status_code == 403


async def test_buyer_cannot_access_merchant_dashboard(client, buyer_headers):
    r = await client.get("/api/merchant/dashboard/stats", headers=buyer_headers)
    assert r.status_code == 403


async def test_merchant_cannot_access_admin_audit(client, merchant_headers):
    r = await client.get("/api/admin/audit-logs", headers=merchant_headers)
    assert r.status_code == 403


async def test_cart_requires_auth(client):
    r = await client.post("/api/cart/items", json={"product_id": "x", "quantity": 1})
    assert r.status_code == 401


async def test_checkout_requires_auth(client):
    r = await client.post("/api/orders/checkout", json={"address": "somewhere"})
    assert r.status_code == 401
