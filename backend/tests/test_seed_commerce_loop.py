"""种草商业化闭环：笔记推荐流 → 作者绑定分销 → 下单归因 → 佣金结算。"""
import json

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


async def test_note_feed_ranked_and_for_product(client, buyer_headers, merchant_headers):
    pid = await _stocked_product_id(client, merchant_headers)
    # 作者发布一篇挂载商品的笔记（admin 审核通过）
    author = await _register(client, "seed_author")
    nb = await client.post(
        "/api/notes",
        json={"title": "好物推荐", "content": "真的很不错", "product_ids": [pid]},
        headers=author,
    )
    assert nb.status_code == 201, nb.text
    note_id = nb.json()["id"]
    admin = (await client.get("/api/auth/me", headers=merchant_headers)).json()
    # 用 admin 审核
    adm = await client.post(
        "/api/auth/login", json={"username": "admin", "password": "admin123"}
    )
    admin_headers = {"Authorization": f"Bearer {adm.json()['access_token']}"}
    rv = await client.post(
        f"/api/notes/{note_id}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert rv.status_code == 200, rv.text

    # 推荐流只返回已审核通过的笔记
    feed = (await client.get("/api/notes/feed", headers=buyer_headers)).json()
    assert any(n["id"] == note_id for n in feed)

    # 商品反查：该商品被这篇笔记种草
    fp = (await client.get(f"/api/notes/for-product/{pid}", headers=buyer_headers)).json()
    assert any(n["id"] == note_id for n in fp)


async def test_note_attach_affiliate_grants_commission(client, buyer_headers, merchant_headers):
    pid = await _stocked_product_id(client, merchant_headers)
    author = await _register(client, "seed_promoter")
    nb = await client.post(
        "/api/notes",
        json={"title": "推广笔记", "content": "买它", "product_ids": [pid]},
        headers=author,
    )
    assert nb.status_code == 201, nb.text
    note_id = nb.json()["id"]
    adm = await client.post(
        "/api/auth/login", json={"username": "admin", "password": "admin123"}
    )
    admin_headers = {"Authorization": f"Bearer {adm.json()['access_token']}"}
    await client.post(f"/api/notes/{note_id}/review", json={"action": "approve"}, headers=admin_headers)

    # 作者将笔记与分销绑定，获得专属推广码
    att = await client.post(f"/api/notes/{note_id}/attach-affiliate", headers=author)
    assert att.status_code == 200, att.text
    code = att.json()["affiliate_code"]
    assert code

    # 买家（未与作者建立点击绑定）直接通过推广码下单
    buyer = await _register(client, "seed_buyer")
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": 1}, headers=buyer)
    order = (
        await client.post(
            "/api/orders/checkout",
            json={"address": "种草闭环地址", "affiliate_code": code},
            headers=buyer,
        )
    ).json()
    assert order.get("affiliate_code") == code

    for target, headers in (("paid", buyer), ("shipped", merchant_headers), ("completed", buyer)):
        r = await client.patch(f"/api/orders/{order['id']}/status", json={"status": target}, headers=headers)
        assert r.status_code == 200, f"{target}: {r.text}"

    # 作者应获得佣金（按订单自带推广码归因，无需点击绑定）
    s = (await client.get("/api/affiliate/summary", headers=author)).json()
    assert s["total_commission"] > 0
