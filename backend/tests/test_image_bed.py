"""AI 商品图真实图床：生成即落盘、对外稳定 URL、可访问、确定性可复现。"""
import os

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_ai_image_lands_on_bed_and_is_served(client, merchant_headers):
    # 取一个商家商品
    me = await client.get("/api/auth/me", headers=merchant_headers)
    mid = me.json()["id"]
    prods = (await client.get(f"/api/products?merchant_id={mid}")).json()
    pid = prods[0]["id"]

    # 未配置网关 -> 确定性占位图落床（离线可用，整条链路可验证）
    r = await client.post(
        f"/api/products/{pid}/ai-image",
        params={"apply": True},
        headers=merchant_headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["images"], "应至少返回一张图"
    url = data["images"][0]
    assert url.startswith("/api/images/bed/"), f"期望图床稳定 URL，实际：{url}"

    # 图床路由可访问且为图片
    img = await client.get(url)
    assert img.status_code == 200, img.text
    assert img.headers["content-type"].startswith("image/")

    # 同商品再次生成，URL 稳定（seed=product.id -> 同名文件 -> 同 URL）
    r2 = await client.post(
        f"/api/products/{pid}/ai-image",
        params={"apply": False},
        headers=merchant_headers,
    )
    assert r2.json()["images"][0] == url


async def test_bed_blocks_path_traversal(client):
    r = await client.get("/api/images/bed/..%2F..%2Fmain.py")
    # 非法文件名应被拒绝(400)/未找到(404)，或回退占位(200)；不应泄露源码
    assert r.status_code in (400, 404, 200)
    if r.status_code == 200:
        assert not r.text.startswith("from fastapi")  # 未泄露源码
