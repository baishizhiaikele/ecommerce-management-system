"""第 2 批：商家效率
- P1-8 数据看板下钻（gmv-by-period / category-detail）
- P1-9 智能补货（restock-suggestions）
"""
import pytest


async def _make_product_with_sales(client, headers, price=99.0, stock=5):
    from sqlalchemy import text as _text
    from app.db.session import SessionLocal

    r = await client.post(
        "/api/products",
        json={
            "name": "B2补货测试", "description": "x", "price": price, "stock": stock,
            "category_id": "cat-default", "status": "active",
        },
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    async with SessionLocal() as db:
        await db.execute(_text("UPDATE products SET status='ACTIVE' WHERE id=:id"), {"id": pid})
        await db.commit()
    return pid


@pytest.mark.asyncio
async def test_restock_suggestion_low_stock(client, merchant_headers, buyer_headers):
    """P1-9：库存极低且近期有销量的商品应给出补货建议。"""
    pid = await _make_product_with_sales(client, merchant_headers, stock=3)
    # 制造销量：下单并支付
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": 2}, headers=buyer_headers)
    co = await client.post("/api/orders/checkout", json={"address": "上海浦东 1 号"}, headers=buyer_headers)
    oid = co.json()["id"]
    await client.post(f"/api/payments/orders/{oid}/pay", headers=buyer_headers)
    await client.post(f"/api/payments/orders/{oid}/confirm", headers=buyer_headers)

    resp = await client.get("/api/inventory/restock-suggestions?days=30", headers=merchant_headers)
    assert resp.status_code == 200, resp.text
    items = resp.json()
    # 该商品库存低且有销量 → 应出现在建议单中
    assert any(it["product_id"] == pid for it in items)


@pytest.mark.asyncio
async def test_gmv_by_period(client, merchant_headers, buyer_headers):
    """P1-8：GMV 按日下钻返回序列（即使 demo 数据为空也应为 list）。"""
    resp = await client.get("/api/merchant/dashboard/gmv-by-period?period=day&days=30", headers=merchant_headers)
    assert resp.status_code == 200, resp.text
    assert isinstance(resp.json(), list)
    # 月维度也应工作
    resp2 = await client.get("/api/merchant/dashboard/gmv-by-period?period=month&days=90", headers=merchant_headers)
    assert resp2.status_code == 200
    assert isinstance(resp2.json(), list)


@pytest.mark.asyncio
async def test_category_detail(client, merchant_headers):
    """P1-8：品类下钻返回 Top 商品列表。"""
    resp = await client.get("/api/merchant/dashboard/category-detail?limit=10", headers=merchant_headers)
    assert resp.status_code == 200, resp.text
    assert isinstance(resp.json(), list)
    if resp.json():
        top = resp.json()[0]
        assert "product_id" in top and "units" in top and "share" in top
