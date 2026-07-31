import pytest

from app.db.session import SessionLocal
from app.models.inventory import InventoryByWarehouse, Warehouse
from app.services.inventory_service import allocate_warehouse

pytestmark = pytest.mark.asyncio


async def _seed_warehouses(db):
    w_e = Warehouse(name="华东仓", region="华东", city="上海", lng="121.47", lat="31.23")
    w_n = Warehouse(name="华北仓", region="华北", city="北京", lng="116.41", lat="39.90")
    w_s = Warehouse(name="西南仓", region="西南", city="成都", lng="104.07", lat="30.67", is_default=1)
    db.add_all([w_e, w_n, w_s])
    await db.flush()
    pid = "PROD_WH_TEST"
    db.add(InventoryByWarehouse(product_id=pid, warehouse_id=w_e.id, quantity=0))   # 华东无货
    db.add(InventoryByWarehouse(product_id=pid, warehouse_id=w_n.id, quantity=5))   # 华北有货
    db.add(InventoryByWarehouse(product_id=pid, warehouse_id=w_s.id, quantity=10))  # 西南有货(默认仓)
    await db.commit()
    return pid, {w.id: w for w in (w_e, w_n, w_s)}


async def test_allocate_nearby_with_stock():
    async with SessionLocal() as db:
        pid, wmap = await _seed_warehouses(db)
        # 华北收货且华北有货 -> 命中华北
        wid = await allocate_warehouse(db, product_id=pid, quantity=1, ship_region="华北")
        assert wmap[wid].region == "华北"
        # 华东收货但华东仓 quantity=0（无货）-> 回退最近有货仓（华北）
        wid2 = await allocate_warehouse(db, product_id=pid, quantity=1, ship_region="华东")
        assert wmap[wid2].region == "华北"
        # 华南收货无对应仓 -> 命中最就近有货仓（西南，比华北近）
        wid3 = await allocate_warehouse(db, product_id=pid, quantity=1, ship_region="华南")
        assert wmap[wid3].region == "西南"


async def test_allocate_no_warehouse_returns_none():
    async with SessionLocal() as db:
        # 未播种任何分仓库存时应回退 None（沿用单仓逻辑）
        assert await allocate_warehouse(db, product_id="NONEXIST", quantity=1) is None
