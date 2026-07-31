"""第 3 批：AI 差异化
- AI-1 客服主动营销（按画像推券/搭配套餐）
- AI-2 个性化首页 A/B 实验桶（返回 bucket/group）
- AI-3 直播脚本自动生成
- AI-4 评论摘要聚合
"""
import pytest


@pytest.mark.asyncio
async def test_active_marketing(client, buyer_headers, merchant_headers):
    """AI-1：登录买家可获取主动营销建议（含优惠券与 AI 话术）。"""
    resp = await client.get("/api/ai/active-marketing", headers=buyer_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "coupons" in body and "ai_suggestion" in body and "fav_categories" in body
    assert isinstance(body["ai_suggestion"], str) and len(body["ai_suggestion"]) > 0


@pytest.mark.asyncio
async def test_home_arrange_ab_bucket(client, buyer_headers):
    """AI-2：首页编排返回 A/B 桶（bucket/group）字段。"""
    resp = await client.get("/api/ai/home-arrange", headers=buyer_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "bucket" in body and "group" in body
    assert body["bucket"] in (0, 1)
    assert body["group"] in ("control", "experiment")


@pytest.mark.asyncio
async def test_live_ai_script(client, merchant_headers, buyer_headers):
    """AI-3：直播间可生成 AI 脚本（含开场/逐品/收尾）。"""
    # 创建直播间
    cr = await client.post(
        "/api/live", json={"title": "B3直播", "cover_url": "https://x/y.jpg"}, headers=merchant_headers
    )
    assert cr.status_code in (200, 201), cr.text
    rid = cr.json()["id"]
    # 挂一个商品（置 ACTIVE 以便挂车生效）
    pid = await _make_product(client, merchant_headers)
    from sqlalchemy import text as _t2
    from app.db.session import SessionLocal
    async with SessionLocal() as db:
        await db.execute(_t2("UPDATE products SET status='ACTIVE' WHERE id=:id"), {"id": pid})
        await db.commit()
    # 挂车：product_id 走 query 参数
    att = await client.post(
        f"/api/live/{rid}/products?product_id={pid}", json={"live_price": 9.9}, headers=merchant_headers
    )
    assert att.status_code in (200, 201), att.text
    detail = await client.get(f"/api/live/{rid}", headers=merchant_headers)
    assert len(detail.json().get("products", [])) >= 1, detail.text
    resp = await client.post(f"/api/live/{rid}/ai-script", headers=merchant_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "opening" in body and "items" in body and "ending" in body
    assert len(body["items"]) >= 1


@pytest.mark.asyncio
async def test_review_summary(client, merchant_headers, buyer_headers):
    """AI-4：商品评论摘要聚合（无评论也应返回结构）。"""
    pid = await _make_product(client, merchant_headers)
    resp = await client.get(f"/api/products/{pid}/review-summary")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "summary" in body and "pros" in body and "cons" in body and "sentiment" in body


async def _make_product(client, headers, price=199.0):
    from sqlalchemy import text as _text
    from app.db.session import SessionLocal

    r = await client.post(
        "/api/products",
        json={"name": "B3商品", "description": "x", "price": price, "stock": 50,
              "category_id": "cat-default", "status": "active"},
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    async with SessionLocal() as db:
        await db.execute(_text("UPDATE products SET status='ACTIVE' WHERE id=:id"), {"id": pid})
        await db.commit()
    return pid
