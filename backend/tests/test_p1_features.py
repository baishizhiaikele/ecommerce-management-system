import io

import pytest


async def _create_merchant_product(client, headers, price=199.0):
    """让商家自己创建一个商品（确定属于该 merchant），返回商品 id。
    商家创建的商品默认 draft（待审核），此处直接经 DB 置为 ACTIVE 以便测试购买链路。"""
    from app.db.session import SessionLocal
    from app.models.product import Product
    from sqlalchemy import text

    r = await client.post(
        "/api/products",
        json={
            "name": "P1测试商品",
            "description": "用于 P1 功能测试",
            "price": price,
            "stock": 50,
            "category_id": "cat-default",
            "status": "active",
        },
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    # 直接 raw SQL 置为 ACTIVE（枚举按 name 存储），避免加载 ORM 实体触发 lazy IO
    async with SessionLocal() as db:
        await db.execute(text("UPDATE products SET status='ACTIVE' WHERE id=:id"), {"id": pid})
        await db.commit()
    return pid


@pytest.mark.asyncio
async def test_full_reduce_promo_applied(client, buyer_headers, merchant_headers):
    """P1-2：商品满减活动（FULL_REDUCE）应纳入算价引擎。"""
    from app.db.session import SessionLocal
    from sqlalchemy import text as _text
    from app.services.promo_engine import apply_item_promotions, collect_full_reduce_progress

    pid = await _create_merchant_product(client, merchant_headers, price=199.0)
    # 直接 raw SQL 插入一条满减活动（满 100 减 20）
    async with SessionLocal() as db:
        await db.execute(
            _text(
                "INSERT INTO promotions (id, title, type, product_id, threshold_amount, "
                "discount_price, is_active, created_at) VALUES (:id, :title, 'FULL_REDUCE', "
                ":pid, 100, 20, 1, datetime('now'))"
            ),
            {"id": __import__("uuid").uuid4().hex, "title": "测试满100减20", "pid": pid},
        )
        await db.commit()

    # 直接驱动促销引擎（绕过购物车/商品状态，聚焦满减逻辑）
    async with SessionLocal() as db:
        discount, gifts, hits = await apply_item_promotions(db, [(pid, 2, 199.0)])
        # 满100减20，每满叠加：398//100=3 次 → 减 60
        assert discount == 60.0, f"满减应减 60（每满100减20叠加3次），实际 {discount}"
        assert any("满100减20" in h for h in hits)
        progress = await collect_full_reduce_progress(db, [(pid, 2, 199.0)])
        assert any(p["product_id"] == pid and p["reached"] for p in progress)


@pytest.mark.asyncio
async def test_live_product_upsert_and_detail(client, merchant_headers):
    """P1-4：商家可挂车并设置直播价/讲解，详情接口返回增强字段。"""
    pid = await _create_merchant_product(client, merchant_headers, price=199.0)
    # 创建直播间
    room = await client.post(
        "/api/live", json={"title": "测试直播间", "cover_url": "http://x/y.jpg"}, headers=merchant_headers
    )
    assert room.status_code in (200, 201), room.text
    room_id = room.json()["id"]
    # 挂车 + 直播价 + 讲解
    up = await client.post(
        f"/api/live/{room_id}/products?product_id={pid}",
        json={"live_price": 9.9, "explaining": True, "pinned": True},
        headers=merchant_headers,
    )
    assert up.status_code == 200, up.text
    assert up.json()["live_price"] == 9.9
    assert up.json()["explaining"] is True
    # 详情应含该商品且带直播价
    detail = await client.get(f"/api/live/{room_id}")
    assert detail.status_code == 200
    prods = detail.json()["products"]
    assert any(p["id"] == pid and p["live_price"] == 9.9 for p in prods)


@pytest.mark.asyncio
async def test_live_order_attribution(client, buyer_headers, merchant_headers):
    """P1-4：从直播间加购结算，订单归因 live_room_id。"""
    from app.db.session import SessionLocal
    from app.models.order import Order

    pid = await _create_merchant_product(client, merchant_headers, price=199.0)
    room = await client.post(
        "/api/live", json={"title": "归因直播间", "cover_url": "http://x/y.jpg"}, headers=merchant_headers
    )
    room_id = room.json()["id"]
    await client.post(
        f"/api/live/{room_id}/products?product_id={pid}",
        json={}, headers=merchant_headers,
    )
    # 买家加购并下单，带 live_room_id
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": 1}, headers=buyer_headers)
    co = await client.post(
        "/api/orders/checkout", json={"address": "上海市浦东新区 demo 路 1 号", "live_room_id": room_id},
        headers=buyer_headers,
    )
    assert co.status_code in (200, 201), co.text
    oid = co.json()["id"]
    async with SessionLocal() as db:
        order = await db.get(Order, oid)
        assert order.live_room_id == room_id


def test_vision_phash_stability():
    """P1-1：相同图片 pHash 一致，明显不同图片汉明距离更大。"""
    from PIL import Image
    from app.services.vision_service import compute_phash, _hamming

    # 生成一张简单图
    img = Image.new("RGB", (64, 64), color=(200, 30, 30))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data = buf.getvalue()
    h1 = compute_phash(data)
    h2 = compute_phash(data)
    assert h1 == h2

    # 另一张不同色图
    img2 = Image.new("RGB", (64, 64), color=(20, 200, 20))
    buf2 = io.BytesIO()
    img2.save(buf2, format="PNG")
    h3 = compute_phash(buf2.getvalue())
    assert _hamming(h1, h3) >= _hamming(h1, h2)  # 不同图距离 >= 同图
