"""商城主流程端到端测试：商品 → AI 店长 → 加购 → 结算 → 状态机 → 评价 → AI 客服 → 看板 → 审计。"""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _merchant_product_id(client, merchant_headers: dict) -> str:
    me = await client.get("/api/auth/me", headers=merchant_headers)
    mid = me.json()["id"]
    prods = await client.get(f"/api/products?merchant_id={mid}")
    items = prods.json()
    # 优先挑库存充足的商品，避免被其他用例新建的小库存商品污染
    for p in items:
        if (p.get("stock") or 0) >= 5:
            return p["id"]
    return items[0]["id"]


async def test_products_listing(client):
    r = await client.get("/api/products")
    assert r.status_code == 200
    products = r.json()
    assert isinstance(products, list) and len(products) >= 1
    assert "id" in products[0] and "name" in products[0]


async def test_ai_generate_for_merchant(client, merchant_headers):
    pid = await _merchant_product_id(client, merchant_headers)
    r = await client.post(f"/api/products/{pid}/ai-generate", json={"note": "夏季促销"}, headers=merchant_headers)
    assert r.status_code == 200, r.text
    ai = r.json()
    assert ai.get("title")
    assert ai.get("sales_copy")
    assert ai.get("price_suggestion") is not None


async def test_full_purchase_flow(client, buyer_headers, merchant_headers):
    """完整链路并断言状态机与情感评价。"""
    pid = await _merchant_product_id(client, merchant_headers)

    # 加购
    cart = await client.post("/api/cart/items", json={"product_id": pid, "quantity": 2}, headers=buyer_headers)
    assert cart.status_code in (200, 201), cart.text

    # 结算
    order_resp = await client.post(
        "/api/orders/checkout", json={"address": "北京市朝阳区 demo 路 1 号"}, headers=buyer_headers
    )
    assert order_resp.status_code in (200, 201), order_resp.text
    order = order_resp.json()
    assert order.get("order_no")
    assert float(order["total_amount"]) > 0
    order_id = order["id"]

    # 状态机：买家支付 → 商家发货 → 买家确认完成
    for target, headers in (("paid", buyer_headers), ("shipped", merchant_headers), ("completed", buyer_headers)):
        r = await client.patch(f"/api/orders/{order_id}/status", json={"status": target}, headers=headers)
        assert r.status_code == 200, f"{target}: {r.text}"
        assert r.json()["status"] == target

    # 已完成订单可评价，并触发情感分析
    rev = await client.post(
        f"/api/products/{pid}/reviews",
        json={"order_id": order_id, "rating": 5, "content": "物流很快，东西很喜欢，非常满意！"},
        headers=buyer_headers,
    )
    assert rev.status_code in (200, 201), rev.text
    assert "sentiment" in rev.json()


async def test_ai_chat(client, buyer_headers):
    pid = (await client.get("/api/products")).json()[0]["id"]
    r = await client.post("/api/ai/chat", json={"product_id": pid, "message": "什么时候发货？"}, headers=buyer_headers)
    assert r.status_code == 200, r.text
    assert r.json().get("reply")


async def test_merchant_dashboard_stats(client, merchant_headers):
    r = await client.get("/api/merchant/dashboard/stats", headers=merchant_headers)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), dict)


async def test_admin_dashboard_and_audit(client, admin_headers):
    stats = await client.get("/api/admin/dashboard/stats", headers=admin_headers)
    assert stats.status_code == 200, stats.text

    logs = await client.get("/api/admin/audit-logs", headers=admin_headers)
    assert logs.status_code == 200
    actions = [l["action"] for l in logs.json()]
    assert "login" in actions


async def test_order_allocates_warehouse(client, buyer_headers, merchant_headers):
    """P0-2：下单后订单项应写入由多仓路由选定的发货仓，且订单 API 正确返回该仓。"""
    from app.db.session import SessionLocal
    from sqlalchemy import text as _text

    pid = await _merchant_product_id(client, merchant_headers)
    # 确保该商品有分仓库存（不依赖 seed 顺序/幂等，独立稳定）
    async with SessionLocal() as db:
        wh = (await db.scalars(_text("SELECT id FROM warehouses LIMIT 1"))).first()
        if wh:
            await db.execute(
                _text(
                    "INSERT OR REPLACE INTO inventory_by_warehouse (id, product_id, warehouse_id, quantity) "
                    "VALUES (:id, :pid, :wid, 10)"
                ),
                {"id": __import__("uuid").uuid4().hex, "pid": pid, "wid": wh},
            )
            await db.commit()
    cart = await client.post("/api/cart/items", json={"product_id": pid, "quantity": 1}, headers=buyer_headers)
    assert cart.status_code in (200, 201), cart.text
    order_resp = await client.post(
        "/api/orders/checkout", json={"address": "北京市朝阳区 demo 路 1 号"}, headers=buyer_headers
    )
    assert order_resp.status_code in (200, 201), order_resp.text
    order = order_resp.json()
    items = order.get("items") or []
    assert items, "订单无明细"
    wh_ids = {it["warehouse_id"] for it in items}
    assert None not in wh_ids, f"订单项未分配发货仓: {items}"
