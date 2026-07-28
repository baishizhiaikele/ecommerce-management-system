"""P3-G 种草笔记：发布挂商品、feed 浏览、点赞切换、权限删除。"""
import pytest

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus


async def _make_product(client, mh, name="种草商品"):
    r = await client.post(
        "/api/products",
        headers=mh,
        json={"name": name, "price": 30, "stock": 5, "category_id": None},
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    return pid


@pytest.mark.asyncio
async def test_note_publish_feed_like(client, buyer_headers, merchant_headers):
    bh, mh = buyer_headers, merchant_headers
    pid = await _make_product(client, mh)

    # 发布挂商品笔记
    r = await client.post(
        "/api/notes",
        headers=bh,
        json={
            "title": "夏日好物分享",
            "content": "这款商品真的很好用，强烈推荐！",
            "images": ["https://example.com/1.png"],
            "product_ids": [pid],
        },
    )
    assert r.status_code == 201, r.text
    note = r.json()
    nid = note["id"]
    assert note["products"][0]["id"] == pid
    assert note["likes_count"] == 0 and note["liked"] is False

    # 挂无效商品被拒
    r = await client.post(
        "/api/notes",
        headers=bh,
        json={"title": "坏笔记", "content": "x", "product_ids": ["not-exist"]},
    )
    assert r.status_code == 400

    # feed 列表 + 关键词搜索
    r = await client.get("/api/notes", headers=mh)
    assert r.status_code == 200
    assert any(n["id"] == nid for n in r.json())
    r = await client.get("/api/notes", headers=mh, params={"keyword": "夏日"})
    assert len(r.json()) >= 1
    r = await client.get("/api/notes", headers=mh, params={"keyword": "不存在的词xyz"})
    assert all(n["id"] != nid for n in r.json())

    # 点赞 / 取消点赞
    r = await client.post(f"/api/notes/{nid}/like", headers=mh)
    assert r.json() == {"note_id": nid, "liked": True, "likes_count": 1}
    r = await client.get(f"/api/notes/{nid}", headers=mh)
    assert r.json()["liked"] is True
    r = await client.post(f"/api/notes/{nid}/like", headers=mh)
    assert r.json()["liked"] is False and r.json()["likes_count"] == 0

    # 非作者删除被拒；作者删除成功
    r = await client.delete(f"/api/notes/{nid}", headers=mh)
    assert r.status_code == 403
    r = await client.delete(f"/api/notes/{nid}", headers=bh)
    assert r.status_code == 204
    r = await client.get(f"/api/notes/{nid}", headers=bh)
    assert r.status_code == 404
