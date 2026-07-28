"""P3-H PLUS 付费会员：订阅/续费、赠积分、下单 95 折叠加 + 全场包邮。"""
import pytest

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus
from app.models.user import User


async def _make_product(client, mh, name="PLUS测试商品", price=100):
    r = await client.post(
        "/api/products",
        headers=mh,
        json={"name": name, "price": price, "stock": 10, "category_id": None},
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    # 收费运费模板：验证 PLUS 包邮
    await client.post(
        "/api/shipping-templates",
        headers=mh,
        json={"name": "PLUS运费模板", "base_fee": 10, "free_amount": 0, "is_default": True},
    )
    return pid


@pytest.mark.asyncio
async def test_plus_subscribe_and_benefits(client, buyer_headers, merchant_headers):
    bh, mh = buyer_headers, merchant_headers

    # 默认未开通
    r = await client.get("/api/plus/status", headers=bh)
    assert r.status_code == 200
    assert r.json()["active"] is False
    assert {p["key"] for p in r.json()["plans"]} == {"monthly", "yearly"}

    me = await client.get("/api/auth/me", headers=bh)
    uid = me.json()["id"]
    async with SessionLocal() as s:
        points_before = (await s.get(User, uid)).points or 0

    # 开通月卡：active + 赠 200 积分
    r = await client.post("/api/plus/subscribe", headers=bh, json={"plan": "monthly"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["active"] is True and body["plan"] == "monthly"
    expire1 = body["expire_at"]
    async with SessionLocal() as s:
        points_after = (await s.get(User, uid)).points or 0
    assert points_after - points_before == 200

    # 续费顺延（再买月卡，到期时间变晚）
    r = await client.post("/api/plus/subscribe", headers=bh, json={"plan": "monthly"})
    assert r.json()["expire_at"] > expire1

    # 无效方案
    r = await client.post("/api/plus/subscribe", headers=bh, json={"plan": "weekly"})
    assert r.status_code == 422

    # PLUS 下单：95 折 + 包邮
    pid = await _make_product(client, mh)
    await client.post("/api/cart/items", headers=bh, json={"product_id": pid, "quantity": 1})
    co = await client.post(
        "/api/orders/checkout", headers=bh, json={"address": "上海市浦东新区 PLUS 路 1 号"}
    )
    assert co.status_code == 201, co.text
    order = co.json()
    assert float(order["freight"]) == 0.0  # PLUS 全场包邮
    # PLUS 额外 95 折：优惠中至少包含 100 * 0.05 = 5（叠加等级折扣时更多）
    assert float(order["discount_amount"]) >= 5.0 - 0.01


@pytest.mark.asyncio
async def test_non_plus_pays_freight(client, merchant_headers):
    mh = merchant_headers
    # 注册一个全新买家（未开通 PLUS）
    reg = await client.post(
        "/api/auth/register",
        json={"username": "plus_free_buyer", "email": "plus_free@e.com", "password": "Test1234", "role": "buyer"},
    )
    assert reg.status_code == 200, reg.text
    bh = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    pid = await _make_product(client, mh, name="非PLUS商品", price=60)
    await client.post("/api/cart/items", headers=bh, json={"product_id": pid, "quantity": 1})
    co = await client.post(
        "/api/orders/checkout", headers=bh, json={"address": "北京市朝阳区普通路 2 号"}
    )
    assert co.status_code == 201, co.text
    order = co.json()
    assert float(order["freight"]) == 10.0  # 未开通照付运费
    assert float(order["discount_amount"]) == pytest.approx(0.0)
