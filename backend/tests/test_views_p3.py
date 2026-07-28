"""浏览历史与最近常买。"""
import pytest

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus


async def _make_product(client, mh, name, price):
    r = await client.post(
        "/api/products",
        headers=mh,
        json={"name": name, "price": price, "stock": 3, "category_id": None},
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    return pid


@pytest.mark.asyncio
async def test_view_history_dedup(client, buyer_headers, merchant_headers):
    mh, bh = merchant_headers, buyer_headers
    p0 = await _make_product(client, mh, "浏览商品A", 10)
    p1 = await _make_product(client, mh, "浏览商品B", 11)
    for _ in range(2):
        await client.post(
            "/api/me/view-log",
            headers=bh,
            json={"product_id": p0, "product_name": "A", "price": 10, "image_url": None},
        )
    await client.post(
        "/api/me/view-log",
        headers=bh,
        json={"product_id": p1, "product_name": "B", "price": 11, "image_url": None},
    )
    r = await client.get("/api/me/history", headers=bh)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data) == 2  # 同商品浏览去重
    ids = [x["product_id"] for x in data]
    assert p0 in ids and p1 in ids


@pytest.mark.asyncio
async def test_recently_bought(client, buyer_headers):
    r = await client.get("/api/me/recently-bought", headers=buyer_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
