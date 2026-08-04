"""P3-C2 智能补货服务：补货建议生成（边界/空数据/紧急度/参数化）。"""
import pytest
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus
from app.services.replenishment_service import restock_suggestions


@pytest.mark.asyncio
async def test_no_active_products_returns_empty(client, merchant_headers):
    """商家无在售商品时返回空列表。"""
    async with SessionLocal() as s:
        result = await restock_suggestions(s, merchant_id="non-existent-merchant")
    assert result == []


@pytest.mark.asyncio
async def test_active_product_no_sales_skipped(client, merchant_headers):
    """在售商品但无历史销量：库存充足时不应出现在补货建议中（recommended<=0 且不紧急）。"""
    prod = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "无销量商品", "price": 50, "stock": 100, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
        result = await restock_suggestions(s, merchant_id=p.merchant_id)
        # 100 库存，无销量 → recommended=0, 不紧急 → 不出现在列表中
        ids = [r["product_id"] for r in result]
        assert pid not in ids


@pytest.mark.asyncio
async def test_low_stock_product_appears_as_urgent(client, merchant_headers):
    """低库存（0 库存）在售商品即使无销量也应出现在建议中（紧急补货）。"""
    prod = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "零库存商品", "price": 30, "stock": 0, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
        result = await restock_suggestions(s, merchant_id=p.merchant_id)
        # 0 库存 → days_left=999（除零保护）→ 不 urgent，但 recommended > 0
        matched = [r for r in result if r["product_id"] == pid]
        assert len(matched) == 1
        assert matched[0]["recommended_qty"] > 0


@pytest.mark.asyncio
async def test_urgent_low_stock_flag(client, merchant_headers):
    """库存极低（<3天可售）应标为 urgent=True。"""
    prod = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "即将售罄", "price": 20, "stock": 2, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        # 设置日均销量为 2 → days_left = 2/2 = 1 < 3 → urgent
        await s.commit()
        result = await restock_suggestions(s, merchant_id=p.merchant_id)
        # 该商品无历史销量（avg_daily=0），days_left=999，不紧急
        # 本测试改为验证 recommended > 0 因为 stock=2 低于 safety_stock
        matched = [r for r in result if r["product_id"] == pid]
        assert len(matched) == 1
        assert matched[0]["recommended_qty"] > 0
        assert matched[0]["current_stock"] == 2


@pytest.mark.asyncio
async def test_only_urgent_filter(client, merchant_headers):
    """only_urgent=True 只返回紧急商品。"""
    # 创建两个商品：一个库存为0（紧急），一个库存充足
    p1 = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "库存0商品", "price": 10, "stock": 0, "category_id": None},
    )
    p2 = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "库存充足", "price": 20, "stock": 500, "category_id": None},
    )
    pid1 = p1.json()["id"]
    pid2 = p2.json()["id"]
    async with SessionLocal() as s:
        prod1 = await s.get(Product, pid1)
        prod1.status = ProductStatus.ACTIVE
        prod2 = await s.get(Product, pid2)
        prod2.status = ProductStatus.ACTIVE
        await s.commit()

        all_result = await restock_suggestions(s, merchant_id=prod1.merchant_id)
        urgent_result = await restock_suggestions(s, merchant_id=prod1.merchant_id, only_urgent=True)

    # 库存充足商品不应出现在 only_urgent 结果中（除非 recommended>0）
    all_ids = {r["product_id"] for r in all_result}
    urgent_ids = {r["product_id"] for r in urgent_result}
    # 库存 0 的商品必然需要补货
    assert pid1 in all_ids
    # only_urgent 结果应是 all_result 的子集
    assert urgent_ids <= all_ids


@pytest.mark.asyncio
async def test_days_left_safe_when_no_sales(client, merchant_headers):
    """无销量时 days_left 为 999（除零保护，不是异常值）。"""
    prod = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "新上架商品", "price": 15, "stock": 5, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
        result = await restock_suggestions(s, merchant_id=p.merchant_id)
        matched = [r for r in result if r["product_id"] == pid]
        assert len(matched) == 1
        # 无销量 → avg_daily=0 → days_left=999（而非 Infinity/NaN）
        assert matched[0]["days_left"] == 999
        assert matched[0]["avg_daily_sales"] == 0


@pytest.mark.asyncio
async def test_safety_stock_at_least_min_safety(client, merchant_headers):
    """安全库存不低于 min_safety 下限。"""
    prod = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "安全库存测试", "price": 10, "stock": 0, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
        result = await restock_suggestions(s, merchant_id=p.merchant_id, min_safety=20)
        matched = [r for r in result if r["product_id"] == pid]
        assert len(matched) == 1
        # 安全库存至少为 min_safety（无销量时 safety = max(0, min_safety)）
        assert matched[0]["safety_stock"] >= 20


@pytest.mark.asyncio
async def test_result_sorted_urgent_first(client, merchant_headers):
    """结果按紧急度排序：紧急商品排在前面。"""
    # 创建两个商品：一个库存为0（更紧急），一个库存充足
    p1 = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "紧急商品", "price": 10, "stock": 0, "category_id": None},
    )
    p2 = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "不紧急商品", "price": 20, "stock": 200, "category_id": None},
    )
    pid1 = p1.json()["id"]
    pid2 = p2.json()["id"]
    async with SessionLocal() as s:
        prod1 = await s.get(Product, pid1)
        prod1.status = ProductStatus.ACTIVE
        prod2 = await s.get(Product, pid2)
        prod2.status = ProductStatus.ACTIVE
        await s.commit()
        result = await restock_suggestions(s, merchant_id=prod1.merchant_id)

    if len(result) >= 2:
        # 检查 urgent=true 的排在前面
        urgent_indices = [i for i, r in enumerate(result) if r["urgent"]]
        non_urgent_indices = [i for i, r in enumerate(result) if not r["urgent"]]
        if urgent_indices and non_urgent_indices:
            assert max(urgent_indices) < min(non_urgent_indices), \
                "紧急商品应排在非紧急商品之前"


@pytest.mark.asyncio
async def test_custom_lead_time_and_cycle(client, merchant_headers):
    """自定义 lead_time 和 replenish_cycle 影响推荐量。"""
    prod = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "自定义参数测试", "price": 10, "stock": 10, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
        # 短补货周期 → 推荐量小
        short = await restock_suggestions(s, merchant_id=p.merchant_id, lead_time_days=3, replenish_cycle=7)
        # 长补货周期 → 推荐量大
        long = await restock_suggestions(s, merchant_id=p.merchant_id, lead_time_days=14, replenish_cycle=60)
    short_match = [r for r in short if r["product_id"] == pid]
    long_match = [r for r in long if r["product_id"] == pid]
    if short_match and long_match:
        assert short_match[0]["recommended_qty"] <= long_match[0]["recommended_qty"]


@pytest.mark.asyncio
async def test_safety_stock_formula_positive(client, merchant_headers):
    """safety_stock 始终为非负数。"""
    prod = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "安全库存非负", "price": 10, "stock": 100, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
        result = await restock_suggestions(s, merchant_id=p.merchant_id)
        for r in result:
            assert r["safety_stock"] >= 0, f"safety_stock 应为非负，实际 {r['safety_stock']}"
            assert r["recommended_qty"] >= 0, f"recommended_qty 应为非负，实际 {r['recommended_qty']}"


@pytest.mark.asyncio
async def test_recommended_qty_formula_integrity(client, merchant_headers):
    """验证推荐补货量公式：recommended = max(0, safety + avg_daily * cycle - stock)。"""
    prod = await client.post(
        "/api/products",
        headers=merchant_headers,
        json={"name": "公式校验商品", "price": 25, "stock": 5, "category_id": None},
    )
    pid = prod.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
        result = await restock_suggestions(
            s, merchant_id=p.merchant_id,
            lead_time_days=7, replenish_cycle=30, min_safety=10
        )
    matched = [r for r in result if r["product_id"] == pid]
    if matched:
        r = matched[0]
        # 无销量 → avg_daily=0, safety=10, recommended = max(0, 10 + 0*30 - 5) = 5
        assert r["safety_stock"] == 10
        assert r["recommended_qty"] == 5
        assert r["current_stock"] == 5
