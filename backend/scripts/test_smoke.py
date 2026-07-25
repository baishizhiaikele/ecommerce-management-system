import asyncio

import httpx

BASE = "http://127.0.0.1:8000/api"


async def main():
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        # 登录
        m = (await c.post("/auth/login", json={"username": "merchant", "password": "merchant123"})).json()
        b = (await c.post("/auth/login", json={"username": "buyer", "password": "buyer123"})).json()
        mt, bt = m["access_token"], b["access_token"]
        mh, bh = {"Authorization": f"Bearer {mt}"}, {"Authorization": f"Bearer {bt}"}

        # 商品列表
        products = (await c.get("/products")).json()
        pid = products[0]["id"]
        print("products:", len(products))

        # AI 生成文案
        r = await c.post(f"/products/{pid}/ai-generate", json={"note": "summer promo"}, headers=mh)
        print("ai_generate status:", r.status_code, r.text[:200])
        ai = r.json()
        print("ai_generate:", ai["title"], "| price:", ai["price_suggestion"], "| copy_len:", len(ai["sales_copy"]))

        # 加购
        cart = (await c.post("/cart/items", json={"product_id": pid, "quantity": 2}, headers=bh)).json()
        print("cart items:", len(cart))

        # 结算
        order = (await c.post("/orders/checkout", json={"address": "北京市朝阳区 demo 路 1 号"}, headers=bh)).json()
        print("order_no:", order["order_no"], "total:", order["total_amount"], "status:", order["status"])

        # 状态机：买家支付 -> 商家发货 -> 买家完成
        for target in ("paid", "shipped", "completed"):
            order = (await c.patch(f"/orders/{order['id']}/status", json={"status": target},
                                   headers=(mh if target == "shipped" else bh))).json()
            print("after", target, "->", order["status"])

        # 评价（触发情感分析事件）
        rev = (await c.post(f"/products/{pid}/reviews",
                            json={"order_id": order["id"], "rating": 5, "content": "物流很快，东西很喜欢，满意！"},
                            headers=bh)).json()
        print("review sentiment(raw):", rev.get("sentiment"))

        # AI 客服
        chat = (await c.post("/ai/chat", json={"product_id": pid, "message": "什么时候发货？"}, headers=bh)).json()
        print("ai chat reply:", chat["reply"][:40])

        # 商家仪表板
        stats = (await c.get("/merchant/dashboard/stats", headers=mh)).json()
        print("merchant stats:", stats)

        # 管理员仪表板 + 审计
        ah = {"Authorization": f"Bearer {(await c.post('/auth/login', json={'username':'admin','password':'admin123'})).json()['access_token']}"}
        admin_stats = (await c.get("/admin/dashboard/stats", headers=ah)).json()
        print("admin stats:", admin_stats)
        audit = (await c.get("/admin/audit-logs", headers=ah)).json()
        print("audit logs:", len(audit))

        # 越权检查：买家尝试改商家商品状态应 403
        r = await c.patch(f"/products/{pid}/status", json={"status": "active"}, headers=bh)
        print("buyer->product.status code:", r.status_code)


asyncio.run(main())
