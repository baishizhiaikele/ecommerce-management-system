import pytest

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus


@pytest.mark.asyncio
async def test_ai_image_mock_fallback(client, merchant_headers):
    mh = merchant_headers
    prod = await client.post(
        "/api/products",
        headers=mh,
        json={"name": "图生成商品", "price": 10, "stock": 5, "category_id": None},
    )
    assert prod.status_code == 201, prod.text
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()

    # 不应用：仅返回候选图
    r = await client.post(f"/api/products/{pid}/ai-image", headers=mh, params={"count": 2})
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["images"]) == 2
    assert body["applied"] is False

    # 应用首张为主图
    r2 = await client.post(
        f"/api/products/{pid}/ai-image", headers=mh, params={"count": 2, "apply": True}
    )
    assert r2.status_code == 200
    assert r2.json()["applied"] is True
    detail = await client.get(f"/api/products/{pid}")
    assert detail.json()["image_url"] == r2.json()["images"][0]


@pytest.mark.asyncio
async def test_search_qa_price_filter(client, buyer_headers):
    h = buyer_headers
    r = await client.post(
        "/api/search/qa",
        params={"question": "200以内的商品"},
        headers=h,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["filters"]["max_price"] == 200.0
    assert "200" in body["answer"]
    assert isinstance(body["products"], list)
