"""分销裂变佣金测试：推广链接 → 点击归因 → 订单完成结算佣金 → 提现审批。"""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _register(client, name: str) -> dict:
    r = await client.post(
        "/api/auth/register",
        json={"username": name, "email": f"{name}@e.com", "password": "Test1234", "role": "buyer"},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _stocked_product_id(client, merchant_headers) -> str:
    me = await client.get("/api/auth/me", headers=merchant_headers)
    prods = (await client.get(f"/api/products?merchant_id={me.json()['id']}")).json()
    for p in prods:
        if (p.get("stock") or 0) >= 5:
            return p["id"]
    return prods[0]["id"]


async def test_affiliate_full_flow(client, merchant_headers, admin_headers):
    promoter = await _register(client, "aff_promoter")
    invitee = await _register(client, "aff_invitee")

    # 推广人生成全店推广链接
    r = await client.post("/api/affiliate/links", json={}, headers=promoter)
    assert r.status_code == 200, r.text
    code = r.json()["code"]
    assert len(code) >= 4

    # 被邀请人点击推广链接 → 建立归因
    r = await client.post("/api/affiliate/track", json={"code": code}, headers=invitee)
    assert r.status_code == 200, r.text
    assert r.json()["bound"] is True

    # 被邀请人下单并完成
    pid = await _stocked_product_id(client, merchant_headers)
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": 1}, headers=invitee)
    order = (
        await client.post("/api/orders/checkout", json={"address": "分销测试地址"}, headers=invitee)
    ).json()
    for target, headers in (("paid", invitee), ("shipped", merchant_headers), ("completed", invitee)):
        r = await client.patch(f"/api/orders/{order['id']}/status", json={"status": target}, headers=headers)
        assert r.status_code == 200, f"{target}: {r.text}"

    # 推广人应有佣金入账（5%）
    s = (await client.get("/api/affiliate/summary", headers=promoter)).json()
    assert s["total_commission"] > 0
    assert s["invitees"] == 1
    commissions = (await client.get("/api/affiliate/commissions", headers=promoter)).json()
    assert len(commissions) == 1
    expected = round(float(order["total_amount"]) * 0.05, 2)
    assert abs(commissions[0]["commission"] - expected) < 0.01

    # 申请提现（金额=可用余额）→ 管理员审批通过
    avail = s["available"]
    r = await client.post("/api/affiliate/withdrawals", json={"amount": avail}, headers=promoter)
    assert r.status_code == 200, r.text
    wid = r.json()["id"]

    # 超额提现应被拒
    r = await client.post("/api/affiliate/withdrawals", json={"amount": 9999}, headers=promoter)
    assert r.status_code == 400

    r = await client.post(
        f"/api/affiliate/admin/withdrawals/{wid}", json={"approve": True}, headers=admin_headers
    )
    assert r.status_code == 200
    assert r.json()["status"] == "approved"

    # 审批后可用余额归零
    s2 = (await client.get("/api/affiliate/summary", headers=promoter)).json()
    assert s2["available"] == 0


async def test_affiliate_self_click_no_binding(client):
    user = await _register(client, "aff_selfclick")
    code = (await client.post("/api/affiliate/links", json={}, headers=user)).json()["code"]
    r = await client.post("/api/affiliate/track", json={"code": code}, headers=user)
    assert r.status_code == 200
    assert r.json()["bound"] is False
