"""关注流动态：事件写入 + feed 聚合 + 未关注为空。"""
import uuid

import pytest

from app.db.session import SessionLocal
from app.models.shop_event import ShopEvent


async def _uid(client, headers) -> str:
    r = await client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_feed_empty_without_follow(client, buyer_headers, merchant_headers):
    """未关注任何店铺时 feed 为空（不含未关注商家的事件）。"""
    mid = await _uid(client, merchant_headers)
    async with SessionLocal() as s:
        s.add(
            ShopEvent(
                merchant_id=mid,
                event_type="new_product",
                product_name="未关注前的新品",
                new_price=9.9,
            )
        )
        await s.commit()

    r = await client.get("/api/follow/feed", headers=buyer_headers)
    assert r.status_code == 200, r.text
    assert r.json() == []


@pytest.mark.asyncio
async def test_follow_feed_flow(client, buyer_headers, merchant_headers):
    """关注商家后，feed 返回上新与降价动态（按时间倒序）。"""
    mid = await _uid(client, merchant_headers)
    async with SessionLocal() as s:
        s.add(
            ShopEvent(
                merchant_id=mid,
                event_type="price_drop",
                product_id=str(uuid.uuid4()),
                product_name="降价测试",
                old_price=199.0,
                new_price=149.0,
            )
        )
        await s.commit()

    r = await client.post(f"/api/follow/{mid}", headers=buyer_headers)
    assert r.status_code == 201, r.text

    r = await client.get("/api/follow/feed", headers=buyer_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    types = {e["event_type"] for e in data}
    assert "new_product" in types  # 上个用例写入的上新事件也可见
    assert "price_drop" in types
    drop = next(e for e in data if e["event_type"] == "price_drop")
    assert drop["old_price"] == 199.0
    assert drop["new_price"] == 149.0
    assert drop["shop_name"]

    # 清理关注关系，避免污染其他用例
    await client.delete(f"/api/follow/{mid}", headers=buyer_headers)
