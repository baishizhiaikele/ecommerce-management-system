"""P3-E 店铺可视化装修：商家保存配置、买家读取并填充商品模块、非法模块被拒。"""
import pytest

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus


async def _make_product(client, mh, name="装修商品"):
    r = await client.post(
        "/api/products",
        headers=mh,
        json={"name": name, "price": 20, "stock": 5, "category_id": None},
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        merchant_id = p.merchant_id
        await s.commit()
    return pid, merchant_id


@pytest.mark.asyncio
async def test_decoration_default_and_save(client, merchant_headers):
    mh = merchant_headers
    # 默认装修
    r = await client.get("/api/decoration/mine", headers=mh)
    assert r.status_code == 200
    body = r.json()
    assert body["theme_color"] == "#1677ff"
    assert body["layout"][0]["type"] == "banner"

    pid, merchant_id = await _make_product(client, mh)

    # 保存自定义装修
    payload = {
        "theme_color": "#f5222d",
        "banner_image": "https://example.com/banner.png",
        "banner_title": "周年庆大促",
        "banner_subtitle": "全场 8 折起",
        "layout": [
            {"type": "banner"},
            {"type": "notice", "text": "满 99 包邮"},
            {"type": "products", "title": "店长推荐", "product_ids": [pid]},
        ],
    }
    r = await client.put("/api/decoration/mine", headers=mh, json=payload)
    assert r.status_code == 200, r.text
    assert r.json()["theme_color"] == "#f5222d"

    # 买家公开读取：products 模块被填充商品
    r = await client.get(f"/api/decoration/{merchant_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["banner_title"] == "周年庆大促"
    mod = next(m for m in body["layout"] if m["type"] == "products")
    assert len(mod["products"]) == 1
    assert mod["products"][0]["id"] == pid

    # 再次保存覆盖（幂等 upsert）
    payload["theme_color"] = "#52c41a"
    r = await client.put("/api/decoration/mine", headers=mh, json=payload)
    assert r.status_code == 200
    r = await client.get("/api/decoration/mine", headers=mh)
    assert r.json()["theme_color"] == "#52c41a"


@pytest.mark.asyncio
async def test_decoration_validation(client, merchant_headers, buyer_headers):
    mh, bh = merchant_headers, buyer_headers
    # 非法模块类型
    r = await client.put(
        "/api/decoration/mine",
        headers=mh,
        json={"theme_color": "#1677ff", "layout": [{"type": "iframe", "src": "evil"}]},
    )
    assert r.status_code == 400
    # 非法主题色
    r = await client.put(
        "/api/decoration/mine", headers=mh, json={"theme_color": "red", "layout": []}
    )
    assert r.status_code == 422
    # 买家不能保存装修
    r = await client.put(
        "/api/decoration/mine", headers=bh, json={"theme_color": "#1677ff", "layout": []}
    )
    assert r.status_code == 403
    # 不存在的店铺
    r = await client.get("/api/decoration/nonexistent-id")
    assert r.status_code == 404
