"""商品问答 Q&A：提问/回答/采纳/删除与权限控制。"""
import pytest

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus


async def _make_product(client, mh, name="QnA测试商品"):
    r = await client.post(
        "/api/products",
        headers=mh,
        json={"name": name, "price": 50, "stock": 5, "category_id": None},
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    return pid


@pytest.mark.asyncio
async def test_qna_full_flow(client, merchant_headers, buyer_headers):
    mh, bh = merchant_headers, buyer_headers
    pid = await _make_product(client, mh)

    # 买家提问
    r = await client.post(
        f"/api/products/{pid}/questions",
        headers=bh,
        json={"content": "这件支持七天无理由吗？"},
    )
    assert r.status_code == 201, r.text
    q = r.json()
    assert q["product_id"] == pid and q["content"]
    qid = q["id"]

    # 列表可见
    r = await client.get(f"/api/products/{pid}/questions")
    assert r.status_code == 200
    assert any(x["id"] == qid for x in r.json())

    # 商家回答
    r = await client.post(
        f"/api/products/questions/{qid}/answers",
        headers=mh,
        json={"content": "支持，不影响二次销售即可。"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert len(body["answers"]) == 1
    assert body["answers"][0]["content"]
    assert body["answers"][0]["username"]  # 用户名回填

    # 提问者采纳
    aid = body["answers"][0]["id"]
    r = await client.post(f"/api/products/questions/{qid}/accept/{aid}", headers=bh)
    assert r.status_code == 200, r.text
    assert r.json()["answers"][0]["is_accepted"] is True

    # 非提问者采纳应被拒
    r = await client.post(f"/api/products/questions/{qid}/accept/{aid}", headers=mh)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_qna_delete(client, merchant_headers, buyer_headers):
    mh, bh = merchant_headers, buyer_headers
    pid = await _make_product(client, mh, name="QnA删除测试商品")
    r = await client.post(
        f"/api/products/{pid}/questions",
        headers=bh,
        json={"content": "要删除的问题"},
    )
    qid = r.json()["id"]

    # 商家不能删别人的问题
    r = await client.delete(f"/api/products/questions/{qid}", headers=mh)
    assert r.status_code == 403

    # 提问者删除成功
    r = await client.delete(f"/api/products/questions/{qid}", headers=bh)
    assert r.status_code == 200
    r = await client.get(f"/api/products/{pid}/questions")
    assert not any(x["id"] == qid for x in r.json())
