"""促销扩展测试：第二件半价 / N 元任选 M 件 / 满赠。"""
import pytest

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _register(client, name: str) -> dict:
    r = await client.post(
        "/api/auth/register",
        json={"username": name, "email": f"{name}@e.com", "password": "Test1234", "role": "buyer"},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _make_product(client, mh, name, price=10, stock=50) -> str:
    r = await client.post(
        "/api/products",
        headers=mh,
        json={"name": name, "price": price, "stock": stock, "category_id": None},
    )
    pid = r.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    return pid


async def _checkout(client, headers, pid, qty):
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": qty}, headers=headers)
    r = await client.post("/api/orders/checkout", json={"address": "促销测试收货地址"}, headers=headers)
    assert r.status_code in (200, 201), r.text
    return r.json()


async def test_second_half_price(client, merchant_headers):
    buyer = await _register(client, "promo_sh_buyer")
    pid = await _make_product(client, merchant_headers, "第二件半价商品", price=10)
    r = await client.post(
        "/api/promotions",
        headers=merchant_headers,
        json={"title": "第二件半价", "type": "second_half", "product_id": pid},
    )
    assert r.status_code == 201, r.text

    order = await _checkout(client, buyer, pid, 2)
    # 2 件共 20 元，第二件半价优惠 5 元
    assert abs(float(order["discount_amount"]) - 5.0) < 0.01


async def test_bundle_n_for_amount(client, merchant_headers):
    buyer = await _register(client, "promo_bd_buyer")
    pid = await _make_product(client, merchant_headers, "任选打包商品", price=10)
    # 缺少 bundle 参数应被拒
    r = await client.post(
        "/api/promotions",
        headers=merchant_headers,
        json={"title": "坏活动", "type": "bundle", "product_id": pid},
    )
    assert r.status_code == 400
    r = await client.post(
        "/api/promotions",
        headers=merchant_headers,
        json={
            "title": "25 元任选 3 件",
            "type": "bundle",
            "product_id": pid,
            "bundle_count": 3,
            "bundle_price": 25,
        },
    )
    assert r.status_code == 201, r.text

    order = await _checkout(client, buyer, pid, 3)
    # 3 件原价 30，打包 25，优惠 5 元
    assert abs(float(order["discount_amount"]) - 5.0) < 0.01


async def test_gift_over_threshold(client, merchant_headers):
    buyer = await _register(client, "promo_gift_buyer")
    pid = await _make_product(client, merchant_headers, "满赠主商品", price=10)
    gift_pid = await _make_product(client, merchant_headers, "赠品小样", price=5)
    r = await client.post(
        "/api/promotions",
        headers=merchant_headers,
        json={
            "title": "满 20 元送小样",
            "type": "gift",
            "product_id": pid,
            "threshold_amount": 20,
            "gift_product_id": gift_pid,
        },
    )
    assert r.status_code == 201, r.text

    # 买 1 件（10 元）未达门槛：无赠品
    order1 = await _checkout(client, buyer, pid, 1)
    items1 = order1["items"]
    assert all(it["product_id"] != gift_pid for it in items1)

    # 买 2 件（20 元）达门槛：0 元赠品入单
    order2 = await _checkout(client, buyer, pid, 2)
    gift_items = [it for it in order2["items"] if it["product_id"] == gift_pid]
    assert len(gift_items) == 1
    assert float(gift_items[0]["price"]) == 0
