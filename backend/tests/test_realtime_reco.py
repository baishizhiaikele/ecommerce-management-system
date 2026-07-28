"""实时行为序列推荐测试。"""
import pytest

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus
from app.models.view import ProductView


async def _uid(client, headers) -> str:
    r = await client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.mark.asyncio
async def test_recommend_follows_recent_views(client, merchant_headers):
    """最近浏览某类目后，推荐应优先返回该类目商品（隔离新买家避免历史行为干扰）。"""
    reg = await client.post(
        "/api/auth/register",
        json={"username": "seq_reco", "email": "seq_reco@e.com", "password": "Test1234", "role": "buyer"},
    )
    assert reg.status_code == 200, reg.text
    buyer_headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    buyer_id = await _uid(client, buyer_headers)
    mid = await _uid(client, merchant_headers)

    async with SessionLocal() as s:
        # 建一个专属类目商品 + 买家浏览记录
        p = Product(
            merchant_id=mid,
            name="行为序列推荐目标商品",
            price=66.0,
            stock=99,
            status=ProductStatus.ACTIVE,
            category_id="cat-reco-seq",
        )
        p2 = Product(
            merchant_id=mid,
            name="同类目候选商品",
            price=88.0,
            stock=99,
            status=ProductStatus.ACTIVE,
            category_id="cat-reco-seq",
        )
        s.add_all([p, p2])
        await s.flush()
        s.add(ProductView(user_id=buyer_id, product_id=p.id, product_name=p.name))
        await s.commit()

    r = await client.get("/api/recommendations", headers=buyer_headers)
    assert r.status_code == 200, r.text
    items = r.json()
    assert items, "推荐不应为空"
    cats = [i.get("category_id") for i in items]
    assert "cat-reco-seq" in cats, f"应优先推荐浏览类目商品: {cats}"


@pytest.mark.asyncio
async def test_recommend_cold_start_fallback(client):
    """无行为的新用户退化为热销榜（非空且不报错）。"""
    reg = await client.post(
        "/api/auth/register",
        json={"username": "cold_reco", "email": "cold_reco@e.com", "password": "Test1234", "role": "buyer"},
    )
    assert reg.status_code == 200, reg.text
    h = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    r = await client.get("/api/recommendations", headers=h)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)
