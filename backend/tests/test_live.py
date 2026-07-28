"""直播带货测试：建播 → 开播 → 观众进入/弹幕 → 下播。"""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _register(client, name: str) -> dict:
    r = await client.post(
        "/api/auth/register",
        json={"username": name, "email": f"{name}@e.com", "password": "Test1234", "role": "buyer"},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_live_full_flow(client, merchant_headers):
    viewer = await _register(client, "live_viewer")

    me = await client.get("/api/auth/me", headers=merchant_headers)
    prods = (await client.get(f"/api/products?merchant_id={me.json()['id']}")).json()
    pids = [p["id"] for p in prods[:2]]

    # 创建直播间（带讲解商品）
    r = await client.post(
        "/api/live",
        headers=merchant_headers,
        json={"title": "开年大促专场", "product_ids": pids},
    )
    assert r.status_code == 201, r.text
    room = r.json()
    assert room["status"] == "scheduled"
    assert room["product_count"] == len(pids)

    # 未开播不能发弹幕
    r = await client.post(
        f"/api/live/{room['id']}/messages", json={"content": "早到了"}, headers=viewer
    )
    assert r.status_code == 400

    # 开播
    r = await client.post(f"/api/live/{room['id']}/start", headers=merchant_headers)
    assert r.status_code == 200
    assert r.json()["status"] == "live"

    # 观众进入 + 发弹幕
    r = await client.post(f"/api/live/{room['id']}/enter", headers=viewer)
    assert r.json()["viewers"] >= 1
    r = await client.post(
        f"/api/live/{room['id']}/messages", json={"content": "主播讲讲第一个链接"}, headers=viewer
    )
    assert r.status_code == 201
    first_id = r.json()["id"]

    msgs = (await client.get(f"/api/live/{room['id']}/messages")).json()
    assert any(m["id"] == first_id for m in msgs)

    # 增量拉取：after_id 之后应为空
    msgs2 = (await client.get(f"/api/live/{room['id']}/messages?after_id={first_id}")).json()
    assert all(m["id"] != first_id for m in msgs2)

    # 详情包含讲解商品
    detail = (await client.get(f"/api/live/{room['id']}")).json()
    assert {p["id"] for p in detail["products"]} <= set(pids)

    # 下播后列表（对买家）不再出现
    r = await client.post(f"/api/live/{room['id']}/end", headers=merchant_headers)
    assert r.json()["status"] == "ended"
    rooms = (await client.get("/api/live")).json()
    assert all(x["id"] != room["id"] for x in rooms)


async def test_live_create_requires_own_product(client, merchant_headers):
    r = await client.post(
        "/api/live",
        headers=merchant_headers,
        json={"title": "非法商品直播", "product_ids": ["not-exist-id"]},
    )
    assert r.status_code == 400
