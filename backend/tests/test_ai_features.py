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


@pytest.mark.asyncio
async def test_home_arrange(client, buyer_headers):
    """B4：AI 首页编排按身份/时段返回有序楼层。"""
    r = await client.get("/api/ai/home-arrange", params={"segment": "member", "hour": 20}, headers=buyer_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["segment"] == "member"
    assert body["hour"] == 20
    assert len(body["floors"]) >= 3
    keys = [f["key"] for f in body["floors"]]
    # 会员在晚间应优先展示领券/推荐类楼层
    assert "coupon" in keys and "recommend" in keys
    assert isinstance(body["insight"], str) and body["insight"]


@pytest.mark.asyncio
async def test_trend_insight_requires_merchant(client, merchant_headers):
    """B5：趋势洞察仅商家可访问，且返回结构化建议。"""
    forbidden = await client.get("/api/ai/trend-insight")
    assert forbidden.status_code in (401, 403)

    r = await client.get("/api/ai/trend-insight", headers=merchant_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body["hot_keywords"], list)
    assert isinstance(body["demand_gap"], list)
    assert isinstance(body["suggested_categories"], list)
    assert isinstance(body["rising_products"], list)
    assert isinstance(body["insight"], str) and body["insight"]
