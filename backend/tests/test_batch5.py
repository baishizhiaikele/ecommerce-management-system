"""批次5：AI比价 / 报表定时邮件 / 审计回放告警。"""
import pytest
from sqlalchemy import func, select

pytestmark = pytest.mark.asyncio(loop_scope="session")

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus
from app.models.report import EmailLog
from app.services import report_task_service


async def _make_product(client, headers, name, price, activate=False):
    r = await client.post(
        "/api/products",
        json={"name": name, "price": price, "stock": 2, "category_id": None},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    if activate:
        async with SessionLocal() as db:
            p = await db.get(Product, pid)
            p.status = ProductStatus.ACTIVE
            await db.commit()
    return r.json()


async def test_price_compare(client, merchant_headers):
    mine = await _make_product(client, merchant_headers, "比价主商品", 100, activate=True)
    await _make_product(client, merchant_headers, "竞品A", 80, activate=True)
    await _make_product(client, merchant_headers, "竞品B", 120, activate=True)
    await _make_product(client, merchant_headers, "竞品C", 90, activate=True)

    r = await client.get(f"/api/products/{mine['id']}/price-compare", headers=merchant_headers)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["our_price"] == 100
    assert data["competitor_count"] >= 3
    assert "suggestion" in data and data["suggestion"]


async def test_report_task_and_send(client, merchant_headers):
    r = await client.post(
        "/api/merchant/report-tasks",
        json={"frequency": "daily", "email": "boss@example.com", "is_active": True},
        headers=merchant_headers,
    )
    assert r.status_code == 200, r.text

    lst = await client.get("/api/merchant/report-tasks", headers=merchant_headers)
    assert lst.status_code == 200 and len(lst.json()) == 1

    prev = await client.get("/api/merchant/report-tasks/preview", headers=merchant_headers)
    assert prev.status_code == 200 and "sales_trend" in prev.json()

    # 触发定时发送（last_sent_at 为空 -> 立即到期）
    async with SessionLocal() as db:
        sent = await report_task_service.send_due_reports(db)
        assert sent >= 1
        n = int(await db.scalar(select(func.count(EmailLog.id))))
        assert n >= 1
    # 再次发送应不再触发（last_sent_at 已更新）
    async with SessionLocal() as db:
        sent2 = await report_task_service.send_due_reports(db)
        assert sent2 == 0


async def test_audit_replay_and_alerts(client, admin_headers):
    rp = await client.get("/api/admin/audit/replay", params={"entity": "order"}, headers=admin_headers)
    assert rp.status_code == 200 and isinstance(rp.json(), list)

    al = await client.get("/api/admin/audit/alerts", headers=admin_headers)
    assert al.status_code == 200
    assert "alerts" in al.json()
