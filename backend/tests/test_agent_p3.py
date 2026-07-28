"""P3-B AI 可行动代理层：工具调用（查库存/比价/凑单/加购/下单）。"""
import pytest
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus


@pytest.mark.asyncio
async def test_agent_lists_tools(client):
    r = await client.get("/api/agent/tools")
    assert r.status_code == 200, r.text
    names = {t["name"] for t in r.json()}
    assert {"check_stock", "compare_price", "bundle_recommend", "add_to_cart", "checkout"} <= names


@pytest.mark.asyncio
async def test_agent_check_stock_intent(client, merchant_headers, buyer_headers):
    prod = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "代理测试商品", "price": 42, "stock": 7, "category_id": None},
    )
    assert prod.status_code == 201, prod.text
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()

    # 直接调用工具
    r = await client.post(
        "/api/agent/tool",
        headers=buyer_headers,
        json={"tool": "check_stock", "params": {"product_id": pid}},
    )
    assert r.status_code == 200, r.text
    assert r.json()["tool_calls"][0]["result"]["stock"] == 7

    # 自然语言意图识别
    chat = await client.post(
        "/api/agent/chat",
        headers=buyer_headers,
        json={"message": f"帮我看看这个还有货吗 {pid}"},
    )
    assert chat.status_code == 200, chat.text
    assert chat.json()["intent"] == "check_stock"


@pytest.mark.asyncio
async def test_agent_add_to_cart_and_checkout(client, merchant_headers, buyer_headers):
    prod = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "代理下单商品", "price": 30, "stock": 10, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    await client.post(
        "/api/shipping-templates",
        headers=merchant_headers,
        json={"name": "默认运费", "base_fee": 5, "free_amount": 99, "is_default": True},
    )

    add = await client.post(
        "/api/agent/tool",
        headers=buyer_headers,
        json={"tool": "add_to_cart", "params": {"product_id": pid}},
    )
    assert add.status_code == 200, add.text
    assert add.json()["tool_calls"][0]["result"]["added"] is True

    co = await client.post(
        "/api/agent/tool",
        headers=buyer_headers,
        json={"tool": "checkout", "params": {"address": "代理测试地址"}},
    )
    assert co.status_code == 200, co.text
    assert co.json()["tool_calls"][0]["result"]["order_id"]


@pytest.mark.asyncio
async def test_agent_bundle_recommend(client, merchant_headers, buyer_headers):
    # 已有购物车场景：先加购再问凑单
    prod = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "凑单商品", "price": 20, "stock": 10, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    await client.post(
        "/api/shipping-templates",
        headers=merchant_headers,
        json={"name": "免邮门槛", "base_fee": 5, "free_amount": 99, "is_default": True},
    )
    await client.post(
        "/api/agent/tool",
        headers=buyer_headers,
        json={"tool": "add_to_cart", "params": {"product_id": pid}},
    )
    r = await client.post(
        "/api/agent/chat", headers=buyer_headers, json={"message": "我还差多少能免运费？"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["intent"] == "bundle_recommend"
    assert r.json()["tool_calls"][0]["result"]["gap_to_free_shipping"] > 0
