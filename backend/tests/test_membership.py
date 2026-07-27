"""会员等级（成长值 → 等级 → 折扣/包邮）与签到任务中心测试。"""
import pytest
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus
from app.models.user import User
from app.services.member_service import award_growth, get_membership
from app.core.member_levels import get_tier


# ---------- 单元：等级计算 ----------
def test_tier_computation():
    assert get_tier(0)["key"] == "bronze"
    assert get_tier(999)["key"] == "bronze"
    assert get_tier(1000)["key"] == "silver"
    assert get_tier(5000)["key"] == "gold"
    assert get_tier(20000)["key"] == "diamond"


def test_get_membership_structure():
    u = User(username="u", email="u@e.com", hashed_password="x", growth_value=0)
    info = get_membership(u)
    assert info["level"] == "bronze"
    assert info["next_level"]["level"] == "silver"
    assert info["next_level"]["gap"] == 1000
    u.growth_value = 6000
    info = get_membership(u)
    assert info["level"] == "gold"
    assert info["free_shipping"] is True
    assert info["next_level"]["level"] == "diamond"


@pytest.mark.asyncio
async def test_award_growth_recomputes_level():
    async with SessionLocal() as s:
        u = User(username="lvuser", email="lv@e.com", hashed_password="x")
        s.add(u)
        await s.flush()
        await award_growth(s, u.id, 6000)
        await s.commit()
        assert u.level == "gold"


# ---------- 接口：会员信息 ----------
@pytest.mark.asyncio
async def test_membership_default_bronze(client, buyer_headers):
    r = await client.get("/api/me/membership", headers=buyer_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["level"] == "bronze"
    assert body["growth_value"] == 0
    assert body["next_level"]["level"] == "silver"


# ---------- 接口：任务中心 ----------
@pytest.mark.asyncio
async def test_task_center_flow(client, buyer_headers):
    # 先签到，使 daily_signin 任务达成
    sin = await client.post("/api/me/signin", headers=buyer_headers)
    assert sin.status_code == 200, sin.text

    tasks = (await client.get("/api/me/tasks", headers=buyer_headers)).json()
    by_key = {t["key"]: t for t in tasks}
    assert by_key["daily_signin"]["completed"] is True
    assert by_key["daily_signin"]["claimed"] is False

    # 领取签到奖励
    claim = await client.post("/api/me/tasks/daily_signin/claim", headers=buyer_headers)
    assert claim.status_code == 200, claim.text
    assert claim.json()["gained"] == 10

    # 重复领取应失败，且状态变为已领取
    again = await client.post("/api/me/tasks/daily_signin/claim", headers=buyer_headers)
    assert again.status_code == 400
    tasks2 = (await client.get("/api/me/tasks", headers=buyer_headers)).json()
    assert {t["key"]: t for t in tasks2}["daily_signin"]["claimed"] is True

    # 不存在的任务
    bad = await client.post("/api/me/tasks/nope/claim", headers=buyer_headers)
    assert bad.status_code == 404


# ---------- 集成：会员权益作用于结算 ----------
@pytest.mark.asyncio
async def test_member_benefit_applied_in_checkout(client):
    # 注册隔离的商家与买家，避免污染共享夹具
    m = await client.post(
        "/api/auth/register",
        json={"username": "mb_merchant", "email": "mb_m@e.com", "password": "Test1234", "role": "merchant"},
    )
    b = await client.post(
        "/api/auth/register",
        json={"username": "mb_buyer", "email": "mb_b@e.com", "password": "Test1234", "role": "buyer"},
    )
    assert m.status_code == 200 and b.status_code == 200, (m.text, b.text)
    mh = {"Authorization": f"Bearer {m.json()['access_token']}"}
    bh = {"Authorization": f"Bearer {b.json()['access_token']}"}

    # 商家建商品（默认 DRAFT，需置为 ACTIVE 方可购买）
    prod = await client.post(
        "/api/products",
        headers=mh,
        json={"name": "会员测试商品", "price": 100, "stock": 10, "category_id": None},
    )
    assert prod.status_code == 201, prod.text
    pid = prod.json()["id"]

    # 买家升级为黄金会员（成长值 6000 → gold：95 折 + 包邮），并激活商品
    async with SessionLocal() as s:
        u = (await s.scalars(
            select(User).where(User.username == "mb_buyer")
        )).first()
        await award_growth(s, u.id, 6000)
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()

    # 商家配置默认运费模板（基础运费 10，无包邮门槛）
    tpl = await client.post(
        "/api/shipping-templates",
        headers=mh,
        json={"name": "默认运费", "base_fee": 10, "free_amount": 0, "is_default": True},
    )
    assert tpl.status_code == 201, tpl.text

    # 买家加购并结算
    await client.post("/api/cart/items", headers=bh, json={"product_id": pid, "quantity": 1})
    co = await client.post("/api/orders/checkout", headers=bh, json={"address": "会员测试收货地址"})
    assert co.status_code in (200, 201), co.text
    order = co.json()
    # 黄金会员：运费全免
    assert float(order["freight"]) == 0.0
    # 95 折：100 - 5 = 95（无优惠券 / 积分抵扣）
    assert float(order["total_amount"]) == 95.0
    assert float(order["discount_amount"]) == 5.0
