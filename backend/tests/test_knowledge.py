"""智能客服知识库自学习测试。"""
import pytest


async def _uid(client, headers) -> str:
    r = await client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_manual_faq_and_suggest(client, buyer_headers, merchant_headers):
    """商家手动录入 FAQ，买家提问命中建议。"""
    mid = await _uid(client, merchant_headers)

    r = await client.post(
        "/api/knowledge",
        json={"question": "商品支持七天无理由退货吗", "answer": "支持，签收后7天内可无理由退货。"},
        headers=merchant_headers,
    )
    assert r.status_code == 201, r.text
    entry_id = r.json()["id"]
    assert r.json()["source"] == "manual"

    # 买家相似提问命中
    r = await client.get(
        "/api/knowledge/suggest",
        params={"merchant_id": mid, "q": "请问支持七天无理由退货么"},
        headers=buyer_headers,
    )
    assert r.status_code == 200, r.text
    hits = r.json()
    assert hits and hits[0]["entry_id"] == entry_id
    assert "无理由退货" in hits[0]["answer"]

    # 命中计数累加
    r = await client.get("/api/knowledge", headers=merchant_headers)
    entry = next(e for e in r.json() if e["id"] == entry_id)
    assert entry["hit_count"] >= 1

    # 不相干问题不命中
    r = await client.get(
        "/api/knowledge/suggest",
        params={"merchant_id": mid, "q": "北京今天天气如何"},
        headers=buyer_headers,
    )
    assert r.status_code == 200
    assert all(h["entry_id"] != entry_id for h in r.json())


@pytest.mark.asyncio
async def test_learn_from_closed_ticket(client, buyer_headers, merchant_headers):
    """工单关闭后自动沉淀 learned 条目（买家首问→商家最新回答）。"""
    r = await client.post(
        "/api/support/tickets",
        json={"message": "这款耳机的电池续航是多久呢", "subject": "续航咨询"},
        headers=buyer_headers,
    )
    assert r.status_code == 201, r.text
    tid = r.json()["id"]

    # 该工单 merchant_id 为买家自身（未关联商品），改为带商品可指向商家；
    # 简化：由买家关闭自己的工单同样触发学习逻辑（商家未回复则不沉淀）
    r = await client.post(f"/api/support/tickets/{tid}/close", headers=buyer_headers)
    assert r.status_code == 200
    # 未有商家回答 → 不应沉淀（learned 条目不出现在商家侧不好断言，跳过）

    # 完整链路：买家提问 → 商家回复 → 关闭 → 商家知识库出现 learned 条目
    mid = await _uid(client, merchant_headers)
    # 造一个商家的商品
    r = await client.post(
        "/api/products",
        json={"name": "知识库测试耳机", "price": 199.0, "stock": 10, "description": "测试"},
        headers=merchant_headers,
    )
    assert r.status_code in (200, 201), r.text
    pid = r.json()["id"]

    r = await client.post(
        "/api/support/tickets",
        json={"message": "知识库测试耳机续航多久", "subject": "续航", "product_id": pid},
        headers=buyer_headers,
    )
    assert r.status_code == 201, r.text
    tid2 = r.json()["id"]

    r = await client.post(
        f"/api/support/tickets/{tid2}/messages",
        json={"content": "续航约40小时，支持快充。"},
        headers=merchant_headers,
    )
    assert r.status_code == 200, r.text

    r = await client.post(f"/api/support/tickets/{tid2}/close", headers=merchant_headers)
    assert r.status_code == 200, r.text

    r = await client.get("/api/knowledge", headers=merchant_headers)
    assert r.status_code == 200
    learned = [e for e in r.json() if e["source"] == "learned"]
    assert any("续航" in e["question"] and "40小时" in e["answer"] for e in learned), r.json()
