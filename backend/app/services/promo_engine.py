"""促销引擎：结算时应用商品级促销（第二件半价 / N 元任选 M 件 / 满赠）。

与优惠券、会员折扣互相独立，可叠加；秒杀走 marketing_service 单独下单通道。
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Promotion, PromotionType

ITEM_PROMO_TYPES = (PromotionType.SECOND_HALF, PromotionType.BUNDLE, PromotionType.GIFT)


def _in_window(promo: Promotion, now: datetime) -> bool:
    def aware(dt):
        if dt is None:
            return None
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    start, end = aware(promo.start_at), aware(promo.end_at)
    if start and now < start:
        return False
    if end and now > end:
        return False
    return True


async def apply_item_promotions(
    db: AsyncSession, items: list[tuple[str, int, float]]
) -> tuple[float, list[str], list[str]]:
    """计算商品级促销优惠。

    items: [(product_id, quantity, unit_price), ...]
    返回 (优惠总额, 赠品商品 id 列表, 命中说明列表)。
    """
    if not items:
        return 0.0, [], []
    now = datetime.now(timezone.utc)
    pids = [pid for pid, _, _ in items]
    rows = await db.scalars(
        select(Promotion).where(
            Promotion.product_id.in_(pids),
            Promotion.is_active == 1,
            Promotion.type.in_(ITEM_PROMO_TYPES),
        )
    )
    by_pid: dict[str, list[Promotion]] = {}
    for p in rows:
        if _in_window(p, now):
            by_pid.setdefault(p.product_id, []).append(p)

    discount = 0.0
    gifts: list[str] = []
    hits: list[str] = []
    for pid, qty, price in items:
        for promo in by_pid.get(pid, []):
            if promo.type == PromotionType.SECOND_HALF and qty >= 2:
                cut = round((qty // 2) * price * 0.5, 2)
                if cut > 0:
                    discount += cut
                    hits.append(f"{promo.title}：-¥{cut:.2f}")
            elif (
                promo.type == PromotionType.BUNDLE
                and promo.bundle_count
                and promo.bundle_price is not None
                and qty >= promo.bundle_count
            ):
                groups = qty // promo.bundle_count
                per_group = promo.bundle_count * price - float(promo.bundle_price)
                if per_group > 0:
                    cut = round(groups * per_group, 2)
                    discount += cut
                    hits.append(f"{promo.title}：-¥{cut:.2f}")
            elif (
                promo.type == PromotionType.GIFT
                and promo.threshold_amount is not None
                and promo.gift_product_id
                and price * qty >= float(promo.threshold_amount)
            ):
                gifts.append(promo.gift_product_id)
                hits.append(f"{promo.title}：赠品 1 件")
    return round(discount, 2), gifts, hits
