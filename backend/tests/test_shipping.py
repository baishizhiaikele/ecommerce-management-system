"""运费模板：商家建默认模板后，结算按模板计算运费，满额/包邮模板运费为 0。"""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _merchant_product_id(client, merchant_headers: dict) -> str:
    me = await client.get("/api/auth/me", headers=merchant_headers)
    mid = me.json()["id"]
    prods = await client.get(f"/api/products?merchant_id={mid}")
    return prods.json()[0]["id"]


async def _clear_cart(client, buyer_headers: dict) -> None:
    cart = (await client.get("/api/cart", headers=buyer_headers)).json()
    items = cart if isinstance(cart, list) else cart.get("items", [])
    for it in items:
        await client.delete(f"/api/cart/items/{it["id"]}", headers=buyer_headers)


async def test_shipping_template_applies_at_checkout(client, buyer_headers, merchant_headers):
    # 默认运费模板：基础运费 10，满 99999 包邮（确保任意低价商品都计运费）
    created = await client.post(
        "/api/shipping-templates",
        json={"name": "标准运费", "base_fee": 10, "free_amount": 99999, "is_default": True},
        headers=merchant_headers,
    )
    assert created.status_code == 201, created.text
    tpls = (await client.get("/api/shipping-templates", headers=merchant_headers)).json()
    assert any(t.get("is_default") for t in tpls), tpls

    pid = await _merchant_product_id(client, merchant_headers)
    await _clear_cart(client, buyer_headers)
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": 1}, headers=buyer_headers)
    order = (await client.post(
        "/api/orders/checkout", json={"address": "运费测试 12345"}, headers=buyer_headers
    )).json()
    assert abs(float(order["freight"]) - 10.0) < 0.01, order

    # 切换为包邮模板（base_fee=0），再次下单运费应为 0
    free = await client.post(
        "/api/shipping-templates",
        json={"name": "全场包邮", "base_fee": 0, "free_amount": 0, "is_default": True},
        headers=merchant_headers,
    )
    assert free.status_code == 201, free.text

    await _clear_cart(client, buyer_headers)
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": 1}, headers=buyer_headers)
    order2 = (await client.post(
        "/api/orders/checkout", json={"address": "运费测试2 12345"}, headers=buyer_headers
    )).json()
    assert abs(float(order2["freight"]) - 0.0) < 0.01, order2
