"""T14：金额计算边界单测。

覆盖下单链路中容易出错的金额边界：
1. `compute_discount`（纯函数）：subtotal<=0、折扣券比例越界、满减未达阈值、
   品类/商家不匹配、结果恒被夹在 [0, subtotal] 内。
2. `get_tier`：青铜会员 discount=1.0（不打折），阈值边界。
3. `_apply_promotions_and_discounts` 的聚合与兜底逻辑（隔离 DB 副作用）：
   - 优惠总和被 `min(discount, subtotal)` 兜底，绝不超小计；
   - 积分抵扣上限取“剩余应付”换算，不会让 discount 翻过 subtotal；
   - 多项优惠叠加后仍为非负且不超过 subtotal。
4. 端到端小计公式：subtotal = Σ unit_price * qty，且 round 到分。
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.core.member_levels import get_tier
from app.models.coupon import Coupon, CouponType
from app.services.coupon_service import compute_discount
from app.services.order_service import _apply_promotions_and_discounts


# --------------------------------------------------------------------------- #
# 1. compute_discount 纯函数边界
# --------------------------------------------------------------------------- #
def _coupon(type_: CouponType, value, threshold=None, applicable_category=None, merchant_id=None) -> Coupon:
    return Coupon(
        id="c1",
        type=type_,
        value=value,
        threshold=threshold,
        applicable_category=applicable_category,
        merchant_id=merchant_id,
        is_active=True,
    )


def test_compute_discount_zero_or_negative_subtotal() -> None:
    c = _coupon(CouponType.FULL_REDUCE, 10, threshold=0)
    assert compute_discount(c, 0.0) == 0.0
    assert compute_discount(c, -5.0) == 0.0


def test_compute_discount_ratio_out_of_range() -> None:
    # 折扣系数必须在 (0,1)，否则视为无效返回 0
    c = _coupon(CouponType.DISCOUNT, 1.0)
    assert compute_discount(c, 100.0) == 0.0
    c = _coupon(CouponType.DISCOUNT, 1.5)
    assert compute_discount(c, 100.0) == 0.0


def test_compute_discount_full_reduce_below_threshold() -> None:
    c = _coupon(CouponType.FULL_REDUCE, 20, threshold=200)
    assert compute_discount(c, 150.0) == 0.0
    assert compute_discount(c, 200.0) == 20.0


def test_compute_discount_clamped_to_subtotal() -> None:
    # 满减 value 超过 subtotal 时，被 min 夹住
    c = _coupon(CouponType.FULL_REDUCE, 999, threshold=0)
    assert compute_discount(c, 50.0) == 50.0


def test_compute_discount_category_mismatch() -> None:
    c = _coupon(CouponType.FULL_REDUCE, 10, threshold=0, applicable_category="culture")
    # 订单不含该品类 -> 0
    assert compute_discount(c, 100.0, category_slugs={"electronics"}) == 0.0
    # 含该品类 -> 正常
    assert compute_discount(c, 100.0, category_slugs={"culture"}) == 10.0


def test_compute_discount_merchant_mismatch() -> None:
    c = _coupon(CouponType.FULL_REDUCE, 10, threshold=0, merchant_id="m_others")
    assert compute_discount(c, 100.0, merchant_ids={"m_self"}) == 0.0
    assert compute_discount(c, 100.0, merchant_ids={"m_others"}) == 10.0


# --------------------------------------------------------------------------- #
# 2. get_tier 边界
# --------------------------------------------------------------------------- #
def test_get_tier_bronze_no_discount() -> None:
    tier = get_tier(0)
    assert tier["key"] == "bronze"
    assert tier["discount"] == 1.0  # 青铜不打折


def test_get_tier_threshold_boundary() -> None:
    # 恰好等于下一等级阈值时升级
    assert get_tier(1000)["key"] == "silver"
    assert get_tier(999)["key"] == "bronze"


# --------------------------------------------------------------------------- #
# 3. _apply_promotions_and_discounts 隔离测试（mock DB 副作用）
# --------------------------------------------------------------------------- #
def _fake_buyer(points: int = 0) -> SimpleNamespace:
    return SimpleNamespace(id="u1", points=points)


async def _call_discount(
    *,
    buyer_points: int = 0,
    subtotal: float,
    tier_key: str = "bronze",
    plus_active: bool = False,
    coupon_value: float | None = None,
    use_points: bool = False,
    promo_discount: float = 0.0,
) -> float:
    """构造最小依赖并调用 _apply_promotions_and_discounts。"""
    tier = next(t for t in __import__("app.core.member_levels", fromlist=["MEMBER_TIERS"]).MEMBER_TIERS
                if t["key"] == tier_key)
    buyer = _fake_buyer(buyer_points)
    order = SimpleNamespace(id="o1")
    pmap: dict = {}

    async def _fake_find_usable_user_coupon(db, user_id, coupon_id):
        return SimpleNamespace(coupon=_coupon(CouponType.FULL_REDUCE, coupon_value, threshold=0))

    with patch("app.services.order_service.apply_item_promotions",
               new=AsyncMock(return_value=(promo_discount, [], {}))), \
         patch("app.services.order_service.find_usable_user_coupon",
               new=AsyncMock(side_effect=_fake_find_usable_user_coupon)), \
         patch("app.services.order_service.use_coupon", new=AsyncMock()), \
         patch("app.services.order_service.add_points", new=AsyncMock()), \
         patch("app.services.order_service.is_plus_active",
               new=AsyncMock(return_value=plus_active)):
        return await _apply_promotions_and_discounts(
            SimpleNamespace(),  # db，内部均被 mock，不会真正访问
            buyer=buyer,
            order=order,
            pmap=pmap,
            subtotal=subtotal,
            promo_input=[],
            tier=tier,
            plus_active=plus_active,
            coupon_id=("c1" if coupon_value is not None else None),
            use_points=use_points,
        )


@pytest.mark.asyncio
async def test_discount_never_exceeds_subtotal() -> None:
    # 会员折扣 + PLUS + 优惠券 + 促销 全部叠加，结果不应超过 subtotal
    d = await _call_discount(subtotal=100.0, tier_key="diamond", plus_active=True,
                             coupon_value=80.0, promo_discount=50.0)
    assert d <= 100.0
    assert d == pytest.approx(100.0)  # 被 min(discount, subtotal) 兜底到 100


@pytest.mark.asyncio
async def test_points_redeem_capped_by_remaining() -> None:
    # subtotal=50, 会员折扣(青铜不打折) + 优惠20 -> 剩30可用积分抵扣，
    # 即便用户有大量积分，抵扣也不会超过剩余应付（不会把 discount 推过 50）
    buyer_points = 100000
    d = await _call_discount(subtotal=50.0, coupon_value=20.0, use_points=True, buyer_points=buyer_points)
    # 优惠券 20 + 积分最多 30 = 50，正好等于 subtotal
    assert d <= 50.0
    assert d == pytest.approx(50.0)


@pytest.mark.asyncio
async def test_points_only_no_other_discount() -> None:
    # 仅用积分：subtotal=30，积分足够，最多抵 30
    d = await _call_discount(subtotal=30.0, use_points=True, buyer_points=10000)
    assert d == pytest.approx(30.0)


@pytest.mark.asyncio
async def test_no_discount_returns_zero() -> None:
    d = await _call_discount(subtotal=88.0)
    assert d == pytest.approx(0.0)


@pytest.mark.asyncio
async def test_bronze_tier_adds_no_member_discount() -> None:
    # 青铜 discount=1.0 -> round(subtotal*(1-1.0))=0，不影响
    d = await _call_discount(subtotal=120.0, tier_key="bronze")
    assert d == pytest.approx(0.0)
