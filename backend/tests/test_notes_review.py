"""种草笔记审核闭环（P3-G 深化）测试。

验证：
- 发布笔记默认 pending，普通用户在公开列表不可见；
- 管理员 approve 后进入公开流（approved）；reject 需原因并标记 rejected；
- 非管理员调用审核接口返回 403。
"""
import pytest

pytestmark = pytest.mark.asyncio

NOTE = {"title": "好物分享", "content": "这件真的好用", "images": [], "product_ids": []}


async def _create(client, headers):
    r = await client.post("/api/notes", json=NOTE, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def test_pending_note_hidden_until_approved(client, buyer_headers, admin_headers):
    created = await _create(client, buyer_headers)
    assert created["review_status"] == "pending"
    # 普通用户公开列表看不到刚发布的待审笔记
    lst = await client.get("/api/notes", headers=buyer_headers)
    assert lst.status_code == 200
    ids = [n["id"] for n in lst.json()]
    assert created["id"] not in ids
    # 管理员审核队列可见
    q = await client.get("/api/notes/admin/queue", headers=admin_headers)
    assert q.status_code == 200
    qids = [n["id"] for n in q.json()]
    assert created["id"] in qids
    # 审核通过
    rv = await client.post(f"/api/notes/{created['id']}/review", json={"action": "approve"}, headers=admin_headers)
    assert rv.status_code == 200
    assert rv.json()["review_status"] == "approved"
    # 公开列表现在可见
    lst2 = await client.get("/api/notes", headers=buyer_headers)
    assert created["id"] in [n["id"] for n in lst2.json()]


async def test_reject_requires_reason(client, buyer_headers, admin_headers):
    created = await _create(client, buyer_headers)
    # 缺原因 -> 400
    bad = await client.post(f"/api/notes/{created['id']}/review", json={"action": "reject"}, headers=admin_headers)
    assert bad.status_code == 400
    ok = await client.post(
        f"/api/notes/{created['id']}/review",
        json={"action": "reject", "reason": "含违规广告"},
        headers=admin_headers,
    )
    assert ok.status_code == 200
    assert ok.json()["review_status"] == "rejected"
    assert ok.json()["reject_reason"] == "含违规广告"


async def test_non_admin_cannot_review(client, buyer_headers):
    created = await _create(client, buyer_headers)
    r = await client.post(f"/api/notes/{created['id']}/review", json={"action": "approve"}, headers=buyer_headers)
    assert r.status_code == 403
