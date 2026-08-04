"""P1-9 智能补货：基于近 N 天销量与现有库存，预测补货建议单。

策略（轻量、无外部依赖）：
- 日均销量 = 近 days 天该商品成交量 / days
- 在途库存 = 采购单/调拨单中尚未入库的数量（demo 用 inbound 预留字段近似，缺省按 0）
- 安全库存 = max(日均销量 * lead_time_days, min_safety)
- 建议补货量 = max(0, 安全库存 + 日均销量 * 补货周期 - 当前库存 - 在途)
- 紧急度 = 预计可售天数 = 当前库存 / 日均销量（<3 天标红）
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product, ProductStatus

DEFAULT_LEAD_TIME_DAYS = 7      # 补货提前期（下单到入库）
DEFAULT_REPLENISH_CYCLE = 30    # 一次备货覆盖天数
DEFAULT_MIN_SAFETY = 10         # 最小安全库存
INFINITE_DAYS = 999             # 无销量时预设"无限可售天数"（非真实无穷大）


async def restock_suggestions(
    db: AsyncSession,
    *,
    merchant_id: str,
    days: int = 30,
    lead_time_days: int = DEFAULT_LEAD_TIME_DAYS,
    replenish_cycle: int = DEFAULT_REPLENISH_CYCLE,
    min_safety: int = DEFAULT_MIN_SAFETY,
    only_urgent: bool = False,
) -> list[dict]:
    """生成补货建议单（仅含需要补货的商品）。"""
    today = datetime.now(timezone.utc).date()
    start = datetime(today.year, today.month, today.day, tzinfo=timezone.utc) - timedelta(days=days - 1)

    # 近 days 天各商品成交总量
    sold_stmt = (
        select(
            OrderItem.product_id,
            func.coalesce(func.sum(OrderItem.quantity), 0),
        )
        .select_from(OrderItem)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(
            Product.merchant_id == merchant_id,
            Order.status.notin_([OrderStatus.PENDING_PAYMENT, OrderStatus.REFUNDED]),
            Order.created_at >= start,
        )
        .group_by(OrderItem.product_id)
    )
    sold_rows = (await db.execute(sold_stmt)).all()
    sold_map = {pid: int(q) for pid, q in sold_rows}
    avg_daily_map = {pid: (q / days) for pid, q in sold_map.items()}

    # 该商家所有在售商品当前库存
    products = list(
        await db.scalars(
            select(Product).where(
                Product.merchant_id == merchant_id, Product.status == ProductStatus.ACTIVE
            )
        )
    )

    suggestions: list[dict] = []
    for p in products:
        avg_daily = avg_daily_map.get(p.id, 0.0)
        safety = max(int(avg_daily * lead_time_days), min_safety)
        recommended = max(0, safety + int(avg_daily * replenish_cycle) - p.stock)
        # 可售天数（避免除零）
        days_left = (p.stock / avg_daily) if avg_daily > 0 else INFINITE_DAYS
        urgent = days_left < 3
        if recommended <= 0 and not urgent:
            continue
        if only_urgent and not urgent:
            continue
        suggestions.append(
            {
                "product_id": p.id,
                "name": p.name,
                "current_stock": p.stock,
                "avg_daily_sales": round(avg_daily, 2),
                "safety_stock": safety,
                "recommended_qty": recommended,
                "days_left": round(days_left, 1),
                "urgent": urgent,
                "window_days": days,
            }
        )

    # 紧急优先，其次建议量大的在前
    suggestions.sort(key=lambda s: (not s["urgent"], -s["recommended_qty"]))
    return suggestions
