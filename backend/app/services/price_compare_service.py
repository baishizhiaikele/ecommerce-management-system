"""AI 比价：将商品售价与同类竞品横向对比，给出调价建议。"""
from sqlalchemy import select

from app.models.product import PriceHistory, Product, ProductStatus
from app.services.ai_service import ai_service


async def price_history(db, product_id: str) -> list[dict]:
    """P1-3 历史价格曲线：返回该商品的价格快照序列（按时间升序）。"""
    rows = await db.scalars(
        select(PriceHistory)
        .where(PriceHistory.product_id == product_id)
        .order_by(PriceHistory.created_at.asc())
    )
    return [
        {
            "price": float(r.price),
            "source": r.source,
            "time": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


async def compare_price(db, product) -> dict:
    comps = await db.scalars(
        select(Product).where(
            Product.category_id == product.category_id,
            Product.status == ProductStatus.ACTIVE,
            Product.id != product.id,
            Product.price > 0,
        )
    )
    comps = list(comps)
    prices = [float(p.price) for p in comps]
    our = float(product.price)

    if prices:
        min_p, max_p = min(prices), max(prices)
        avg = sum(prices) / len(prices)
        cheaper = sum(1 for x in prices if x > our)
        percentile = round(cheaper / len(prices) * 100, 1)
    else:
        min_p = max_p = avg = our
        percentile = 50.0

    prompt = (
        f"商品「{product.name}」售价 {our:.2f} 元，"
        f"同类 {len(prices)} 件竞品价格区间 {min_p:.2f}~{max_p:.2f} 元，均价 {avg:.2f} 元。"
        f"请给商家一句中文调价建议（不超过 40 字）。"
    )
    suggestion = await ai_service.generate_text(prompt)
    if not suggestion:
        if our > avg and avg:
            suggestion = f"你的售价高于同类均价 {avg:.2f} 元，可考虑下调以提升转化。"
        elif our < min_p:
            suggestion = f"你的售价低于同类最低 {min_p:.2f} 元，可适当上调增加利润。"
        else:
            suggestion = f"你的售价处于同类合理区间（均价 {avg:.2f} 元），保持竞争力即可。"

    return {
        "product_id": product.id,
        "product_name": product.name,
        "our_price": our,
        "competitor_count": len(prices),
        "min_price": min_p,
        "max_price": max_p,
        "avg_price": avg,
        "percentile": percentile,
        "suggestion": suggestion,
    }
