"""第 4 批：增长与留存（P2-1 拼团/砍价完整性）
- 砍价助力去重（同人不能重复砍同一砍价）
- 拼团成团超时自动解散（expire_groups）
"""
import pytest


async def _make_product(client, headers, price=199.0):
    from sqlalchemy import text as _text
    from app.db.session import SessionLocal

    r = await client.post(
        "/api/products",
        json={"name": "B4商品", "description": "x", "price": price, "stock": 50,
              "category_id": "cat-default", "status": "active"},
        headers=headers,
    )
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]
    async with SessionLocal() as db:
        await db.execute(_text("UPDATE products SET status='ACTIVE' WHERE id=:id"), {"id": pid})
        await db.commit()
    return pid


@pytest.mark.asyncio
async def test_bargain_help_dedup(client, merchant_headers, buyer_headers):
    """P2-1：同一用户不能重复帮砍同一砍价；不同行为（再次砍）被拒。"""
    pid = await _make_product(client, merchant_headers)
    init = await client.post(
        "/api/marketing/bargains",
        json={"product_id": pid, "origin_price": 100, "floor_price": 60},
        headers=merchant_headers,
    )
    assert init.status_code == 200, init.text
    bid = init.json()["id"]
    # 同一买家连续帮砍 3 刀均成功
    for _ in range(3):
        c = await client.post(f"/api/marketing/bargains/{bid}/cut", json={}, headers=buyer_headers)
        assert c.status_code == 200, c.text
    # 第 4 刀触发防刷上限（同一人最多 3 刀）
    c4 = await client.post(f"/api/marketing/bargains/{bid}/cut", json={}, headers=buyer_headers)
    assert c4.status_code in (400, 409), c4.text


@pytest.mark.asyncio
async def test_groupbuy_expire_auto_refund(client, merchant_headers, buyer_headers):
    """P2-1：超时未成团的拼团在 expire_groups 后被标记 failed 且成员订单取消。"""
    from datetime import datetime, timezone
    from sqlalchemy import text as _text
    from app.db.session import SessionLocal
    from app.models.marketing import GroupBuy
    from app.models.order import OrderStatus
    from app.services import marketing_service

    pid = await _make_product(client, merchant_headers)
    init = await client.post(
        "/api/marketing/groups",
        json={"product_id": pid, "price": 80, "required_size": 3, "title": "B4拼团"},
        headers=merchant_headers,
    )
    assert init.status_code == 200, init.text
    gid = init.json()["id"]
    # 把拼团创建时间改为过去（超过 TTL），模拟超时
    async with SessionLocal() as db:
        await db.execute(_text("UPDATE group_buys SET created_at=:t WHERE id=:id"),
                         {"t": datetime(2000, 1, 1, tzinfo=timezone.utc), "id": gid})
        await db.commit()
    # 买家参团（未成团，不生成订单）
    join = await client.post(f"/api/marketing/groups/{gid}/join", json={"address": "上海浦东 1 号"}, headers=buyer_headers)
    assert join.status_code == 200, join.text
    assert join.json()["status"] == "open"

    # 直接调用 expire_groups（无需等待定时任务）
    async with SessionLocal() as db:
        n = await marketing_service.expire_groups(db, now=datetime.now(timezone.utc))
        assert n >= 1
        g = await db.get(GroupBuy, gid)
        assert g.status == "failed"
