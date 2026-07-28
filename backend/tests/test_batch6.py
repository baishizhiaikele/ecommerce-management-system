"""批次6：通知分类免打扰（DND）。"""
import pytest
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.notification import Notification, NotificationType

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_notification_dnd(client):
    r = await client.post(
        "/api/auth/register",
        json={"username": "dnduser1", "password": "dnd12345", "email": "dnd1@example.com"},
    )
    assert r.status_code == 200, r.text
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    from app.models.user import User as U

    async with SessionLocal() as db:
        u = await db.scalar(select(U).where(U.username == "dnduser1"))
        uid = u.id

    # 直接写入两条不同分类的通知（演示用）
    async with SessionLocal() as db:
        db.add(Notification(user_id=uid, type=NotificationType.POINTS, title="积分", content="x"))
        db.add(Notification(user_id=uid, type=NotificationType.ORDER, title="订单", content="y"))
        await db.commit()

    cats = await client.get("/api/notifications/categories", headers=headers)
    assert cats.status_code == 200 and "points" in cats.json()["categories"]

    lst = await client.get("/api/notifications", headers=headers)
    assert lst.status_code == 200 and len(lst.json()) == 2

    s = await client.put("/api/notifications/settings", json={"muted": ["points"]}, headers=headers)
    assert s.status_code == 200 and "points" in s.json()["muted"]

    lst2 = await client.get("/api/notifications", headers=headers)
    types2 = [n["type"] for n in lst2.json()]
    assert "points" not in types2 and types2 == ["order"], types2

    uc = await client.get("/api/notifications/unread-count", headers=headers)
    assert uc.status_code == 200 and uc.json()["count"] == 1

    # 取消静音后恢复可见
    await client.put("/api/notifications/settings", json={"muted": []}, headers=headers)
    lst3 = await client.get("/api/notifications", headers=headers)
    assert {n["type"] for n in lst3.json()} == {"points", "order"}
