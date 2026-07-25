"""订单/购物车共用的商品快照工具。

此前 cart 与 orders 两个路由各自用 `db.get(Product, id)` 逐条加载商品，
形成 N+1 查询；两者还各自内联了「商品不存在→'已下架'」的兜底逻辑。
这里统一为批量加载 + 名称兜底，供两者复用，行为保持一致。
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product


async def load_product_map(db: AsyncSession, product_ids) -> dict:
    """按 id 列表批量加载商品，返回 {id: Product}，避免逐条查询的 N+1。"""
    ids = list({pid for pid in product_ids if pid is not None})
    if not ids:
        return {}
    rows = await db.scalars(select(Product).where(Product.id.in_(ids)))
    return {p.id: p for p in rows}


def snapshot_name(snapshot: dict, product_id, fallback: str = "已下架") -> str:
    """取商品名；商品不存在时返回统一的兜底文案。"""
    product = snapshot.get(product_id)
    return product.name if product else fallback
