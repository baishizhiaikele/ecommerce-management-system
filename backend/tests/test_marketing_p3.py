"""P3-C 秒杀（原子防超卖）+ 拼团 + 砍价。"""
import pytest
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.content import Promotion, PromotionType
from app.models.marketing import Bargain, GroupBuy
from app.models.product import Product, ProductStatus


async def _make_product(client, mh, price=10, stock=50):
    r = await client.post(
        "/api/products", headers=mh,
        json={"name": "营销测试商品", "price": price, "stock": stock, "category_id": None},
    )
    pid = r.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    return pid


@pytest.mark.asyncio
async def test_flash_atomic_no_oversell(client, merchant_headers, buyer_headers):
    pid = await _make_product(price=10, stock=50, client=client, mh=merchant_headers)
    async with SessionLocal() as s:
        promo = Promotion(
            title="秒杀", type=PromotionType.FLASH, product_id=pid,
            discount_price=9, stock_limit=2, stock_sold=0, is_active=1,
        )
        s.add(promo)
        await s.commit()
        promo_id = promo.id

    r1 = await client.post("/api/marketing/flash/join", headers=buyer_headers,
                           json={"promotion_id": promo_id, "quantity": 1, "address": "A"})
    assert r1.status_code == 200, r1.text
    r2 = await client.post("/api/marketing/flash/join", headers=buyer_headers,
                           json={"promotion_id": promo_id, "quantity": 1, "address": "B"})
    assert r2.status_code == 200, r2.text
    # 第 3 次应售罄（库存仅 2）
    r3 = await client.post("/api/marketing/flash/join", headers=buyer_headers,
                           json={"promotion_id": promo_id, "quantity": 1, "address": "C"})
    assert r3.status_code == 400
    assert "售罄" in r3.json()["detail"]

    async with SessionLocal() as s:
        p = await s.get(Promotion, promo_id)
        assert p.stock_sold == 2  # 原子扣减，绝不超卖


@pytest.mark.asyncio
async def test_group_buy_completes(client, merchant_headers, buyer_headers):
    pid = await _make_product(price=20, stock=50, client=client, mh=merchant_headers)
    g = await client.post("/api/marketing/groups", headers=buyer_headers,
                          json={"product_id": pid, "price": 18, "required_size": 2, "address": "团长"})
    assert g.status_code == 200, g.text
    gid = g.json()["id"]
    assert g.json()["status"] == "open"

    # 第二个买家参团 -> 成团
    j = await client.post(f"/api/marketing/groups/{gid}/join", headers=merchant_headers,
                          json={"address": "团员"})
    assert j.status_code == 200, j.text
    assert j.json()["status"] == "completed"
    assert j.json()["current_size"] == 2

    async with SessionLocal() as s:
        members = list(await s.scalars(select(GroupBuy).where(GroupBuy.id == gid)))
        assert members[0].status == "completed"
        # 两个成员都应有订单
        from app.models.marketing import GroupBuyMember
        ms = list(await s.scalars(select(GroupBuyMember).where(GroupBuyMember.group_id == gid)))
        assert all(m.order_id for m in ms)


@pytest.mark.asyncio
async def test_bargain_reaches_floor_then_buy(client, merchant_headers, buyer_headers):
    pid = await _make_product(price=100, stock=50, client=client, mh=merchant_headers)
    b = await client.post("/api/marketing/bargains", headers=buyer_headers,
                          json={"product_id": pid, "origin_price": 100, "floor_price": 80})
    assert b.status_code == 200, b.text
    bid = b.json()["id"]

    # 砍价直到触底：模拟多人助力（每人一刀，防刷），发起者先砍一刀、买家再砍一刀
    cutters = [merchant_headers, buyer_headers]
    last = None
    for i in range(6):
        c = await client.post(f"/api/marketing/bargains/{bid}/cut", headers=cutters[i % len(cutters)],
                              json={"address": "砍手"})
        assert c.status_code == 200, c.text
        last = c
        if c.json()["status"] == "locked":
            break
    assert last.json()["status"] == "locked"
    assert c.json()["current_price"] <= 80

    buy = await client.post(f"/api/marketing/bargains/{bid}/buy", headers=buyer_headers,
                            json={"address": "成交"})
    assert buy.status_code == 200, buy.text
    assert buy.json()["total_amount"] <= 80
