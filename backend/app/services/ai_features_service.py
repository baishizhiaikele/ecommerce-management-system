"""B4/B5：AI 首页编排 与 AI 选品/趋势洞察。

两项能力都遵循项目既有约定：
- 有 AI_API_KEY 时调用大模型生成洞察文案；
- 无 key（本地/CI）时返回确定性的 mock，保证接口可独立运行与测试。
"""

from datetime import datetime
import hashlib
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.catalog import Category
from app.models.product import Product
from app.models.search import SearchKeyword
from app.models.user import User
from app.models.view import ProductView
from app.schemas.ai import FloorOut, HomeArrangeOut, TrendInsightOut
from app.schemas.product import ProductOut
from app.services.ai_service import ai_service
from app.services.product_service import list_products
from app.services.profile_service import infer_segment, profile_summary
from app.services.recommendation_service import recommend_for
from app.services.search_service import top_keywords

# 与前端 Market.tsx 区块一一对应的可选楼层
_ALL_FLOORS: dict[str, str] = {
    "categories": "分类导航",
    "coupon": "领券中心",
    "flash": "限时秒杀",
    "top_sales": "热销榜",
    "top_rating": "好评榜",
    "recommend": "猜你喜欢",
    "recent": "最近浏览",
    "shops": "店铺街",
    "theme": "主题频道",
}

# 段位默认值（未登录用户或段位未识别时使用）
_DEFAULT_SEGMENT = "buyer"

# 身份优先级（决定楼层的基础排序）——各身份差异显著，肉眼可辨
_SEGMENT_PRIORITY: dict[str, list[str]] = {
    "new": ["categories", "coupon", "flash", "shops", "top_sales", "recommend", "top_rating", "recent", "theme"],
    "returning": ["recent", "recommend", "top_rating", "coupon", "flash", "top_sales", "shops", "categories", "theme"],
    "member": ["coupon", "recommend", "flash", "top_rating", "recent", "top_sales", "shops", "categories", "theme"],
}
_DEFAULT_ORDER = ["categories", "coupon", "flash", "top_sales", "top_rating", "recommend", "recent", "shops", "theme"]

# 时段 -> 给特定楼层的提前量（数值越大，拖拽越明显，肉眼可见顺序变化）
_PHASE_BOOST: dict[str, dict[str, int]] = {
    "morning": {"categories": -6, "flash": -4, "coupon": -2},
    "noon": {"recommend": -6, "shops": -4, "top_sales": -2},
    "afternoon": {"top_sales": -6, "shops": -3, "coupon": -2},
    "evening": {"recommend": -6, "coupon": -4, "top_rating": -2, "flash": -2},
    "night": {"recommend": -6, "recent": -4, "top_rating": -2},
    "late_night": {"recommend": -6, "recent": -4, "theme": -2},
}

_PHASE_LABEL = {
    "morning": "清晨",
    "noon": "午间",
    "afternoon": "午后",
    "evening": "晚间",
    "night": "深夜",
    "late_night": "凌晨",
}

_SEGMENT_LABEL = {
    "new": "新客",
    "returning": "老客",
    "member": "会员",
    "buyer": "普通买家",
}

_REASON = {
    "categories": "快速建立品类心智，便于发现好物",
    "coupon": "用优惠降低决策门槛，提升转化",
    "flash": "限时低价制造紧迫感，拉动即时下单",
    "top_sales": "热销背书降低选择成本",
    "top_rating": "好评口碑增强信任",
    "recommend": "个性化推荐贴合偏好，提高停留",
    "recent": "延续上次兴趣，唤醒复访",
    "shops": "店铺街满足品牌化逛街需求",
    "theme": "主题频道制造场景化消费灵感",
}


def _phase_of(hour: int) -> str:
    if 6 <= hour < 11:
        return "morning"
    if 11 <= hour < 14:
        return "noon"
    if 14 <= hour < 18:
        return "afternoon"
    if 18 <= hour < 23:
        return "evening"
    if 23 <= hour < 24:
        return "night"
    return "late_night"


async def arrange_home(
    db: AsyncSession,
    segment_override: str | None,
    hour: int | None,
    user: User | None = None,
) -> HomeArrangeOut:
    """按真实用户身份与时段编排首页楼层，并为各楼层填充真实商品。

    A（真实身份）：若传入 user，则由其真实数据推导 segment（忽略前端假选）；
       segment_override 仅作调试/演示用。
    B（真实商品）：recommend/recent/flash/top_sales/top_rating/shops 等楼层
       调用真实取数，冷启动走热销兜底。
    C（LLM 决策）：有 AI_API_KEY 时让模型对楼层顺序与强调楼层做决策，
       无 key 时降级为确定性（身份+时段）排序。
    """
    # A：真实身份识别
    if user is not None:
        segment = await infer_segment(db, user)
    else:
        segment = segment_override or _DEFAULT_SEGMENT
    if segment not in _SEGMENT_PRIORITY:
        segment = _DEFAULT_SEGMENT

    if hour is None:
        hour = datetime.now().hour
    hour = max(0, min(23, hour))
    phase = _phase_of(hour)

    # B：为各楼层取真实商品（先全量取候选，供 LLM 决策时参考，也直接用于渲染）
    candidates = await _build_floor_products(db, user)
    floor_products: dict[str, list] = {k: v for k, v in candidates.items()}

    # C：LLM 决策楼层顺序；无 key 或失败则确定性排序
    # AI-2 A/B 实验：用 user.id 哈希稳定分桶——实验组(1)走 LLM 决策，对照组(0)走规则编排。
    # 这样同一用户每次请求落入同一桶，便于统计各桶首页 CTR 差异。
    user_id = user.id if user else None
    bucket = 0
    group = "control"
    if user is not None:
        bucket = int(hashlib.md5(user.id.encode()).hexdigest(), 16) % 2
        group = "experiment" if bucket == 1 else "control"
    llm_enabled = bucket == 1 and settings.AI_API_KEY
    focus_floor = None
    if user is not None and llm_enabled:
        order_count = await _order_count(db, user_id) if user_id else 0
        decision = await ai_service.decide_home_layout(
            profile_summary(user, segment, order_count),
            {k: [p.model_dump() for p in v] for k, v in candidates.items()},
            _PHASE_LABEL[phase],
        )
        if decision:
            ordered = [k for k in decision["floor_order"] if k in floor_products]
            for k in floor_products:
                if k not in ordered:
                    ordered.append(k)
            ordered_keys = ordered
            focus_floor = decision.get("focus_floor")
            rationale = decision.get("rationale")
        else:
            ordered_keys, rationale = _deterministic_order(segment, phase), None
    else:
        ordered_keys, rationale = _deterministic_order(segment, phase), None

    # 渲染楼层（LLM 强调的楼层 reason 追加说明）
    floors = []
    for k in ordered_keys:
        reason = _REASON.get(k, "贴合当前场景")
        if focus_floor and k == focus_floor:
            reason = "AI 重点推荐：" + reason
        floors.append(
            FloorOut(
                key=k,
                title=_ALL_FLOORS[k],
                reason=reason,
                products=[ProductOut.model_validate(p).model_dump(mode="json") for p in floor_products.get(k, [])],
            )
        )

    # insight：LLM 决策理由优先，否则确定性模板
    if rationale:
        insight = rationale
    else:
        insight = await ai_service.generate_text(
            "你是电商首页体验师。请用一句中文（40字内）说明：为何针对"
            f"「{_SEGMENT_LABEL.get(segment, segment)}」用户在「{_PHASE_LABEL[phase]}」"
            f"优先展示这些首页楼层：{', '.join(_ALL_FLOORS[k] for k in ordered_keys[:4])}。"
        )
        if not insight:
            top3 = "、".join(_ALL_FLOORS[k] for k in ordered_keys[:3])
            insight = (
                f"已为「{_SEGMENT_LABEL.get(segment, segment)}」在「{_PHASE_LABEL[phase]}」"
                f"智能编排：优先展示 {top3} 等楼层，贴合当前身份与时段偏好。"
            )

    return HomeArrangeOut(
        segment=segment, hour=hour, floors=floors, insight=insight, bucket=bucket, group=group
    )


# ---------------------------------------------------------------------------
# 内部取数辅助
# ---------------------------------------------------------------------------

async def _order_count(db: AsyncSession, user_id: str) -> int:
    from app.models.order import Order
    from sqlalchemy import func, select

    return int(await db.scalar(select(func.count(Order.id)).where(Order.buyer_id == user_id)) or 0)


def _deterministic_order(segment: str, phase: str) -> list[str]:
    """身份+时段的确定性楼层排序（无 LLM 时兜底）。"""
    base_order = _SEGMENT_PRIORITY.get(segment, _DEFAULT_ORDER)
    boost = _PHASE_BOOST.get(phase, {})
    return sorted(base_order, key=lambda k: base_order.index(k) + boost.get(k, 0))


async def _build_floor_products(db: AsyncSession, user: User | None) -> dict[str, list]:
    """为各楼层取真实候选商品。"""
    out: dict[str, list] = {}

    # 猜你喜欢：复用成熟的行为召回引擎（个性化）
    if user is not None:
        out["recommend"] = await recommend_for(db, user.id, limit=6)
    else:
        items, _ = await list_products(db, sort="sales", page=1, page_size=6)
        out["recommend"] = items

    # 最近浏览
    if user is not None:
        rows = list(
            await db.scalars(
                select(Product)
                .join(ProductView, ProductView.product_id == Product.id)
                .where(ProductView.user_id == user.id)
                .order_by(ProductView.created_at.desc())
                .limit(6)
            )
        )
        seen: set[str] = set()
        recent: list[Product] = []
        for p in rows:
            if p.id not in seen:
                recent.append(p)
                seen.add(p.id)
        out["recent"] = recent
    else:
        out["recent"] = []

    # 限时秒杀 / 热销榜 / 好评榜：基于在售商品排序（数据模型无 discount 字段，秒杀以热销近似）
    flash_items, _ = await list_products(db, sort="sales", page=1, page_size=6)
    out["flash"] = flash_items
    sales_items, _ = await list_products(db, sort="sales", page=1, page_size=6)
    out["top_sales"] = sales_items
    rating_items, _ = await list_products(db, sort="top_rating", page=1, page_size=6)
    out["top_rating"] = rating_items

    # 店铺街：取有在售商品的卖家前 6（以商品形式承载，前端按 merchant 聚合展示）
    shop_items, _ = await list_products(db, page=1, page_size=6)
    out["shops"] = shop_items

    # 分类/领券/主题：无独立商品列表，留空（前端仍渲染入口区块）
    out.setdefault("categories", [])
    out.setdefault("coupon", [])
    out.setdefault("theme", [])
    return out


async def trend_insight(db: AsyncSession) -> TrendInsightOut:
    """基于搜索热词与在售商品，给商家输出选品/趋势洞察。"""
    hot = await top_keywords(db, limit=20)
    keywords = hot

    # 取每个热词的搜索次数，用于缺口排序与展示
    kw_rows = (await db.scalars(select(SearchKeyword))).all()
    kw_counts = {r.keyword: r.count for r in kw_rows}

    cats = (await db.execute(select(Category))).scalars().all()
    cat_names = [c.name for c in cats]

    demand_gap: list[dict[str, Any]] = []
    suggested: dict[str, list[str]] = {}
    for kw in hot:
        _, total = await list_products(
            db, keyword=kw, page=1, page_size=1
        )
        if total < 5:  # 搜索热但供给不足 -> 选品缺口
            matched = next((c for c in cat_names if c and (c in kw or kw in c)), None)
            cat_label = matched or kw
            demand_gap.append(
                {
                    "keyword": kw,
                    "search_count": kw_counts.get(kw, 0),
                    "matched_products": total,
                    "suggested_category": cat_label,
                }
            )
            suggested.setdefault(cat_label, []).append(kw)

    suggested_categories = [
        {"category": k, "keywords": v} for k, v in suggested.items()
    ]

    items, _ = await list_products(
        db, sort="sales", page=1, page_size=8
    )
    rising = [ProductOut.model_validate(p).model_dump(mode="json") for p in items]

    gap_text = "、".join(d["keyword"] for d in demand_gap[:5]) or "暂无显著缺口"
    insight = await ai_service.generate_text(
        "你是电商选品顾问。请用两句中文（80字内）给商家建议：基于以下"
        f"搜索热词与供给缺口（{gap_text}），应优先上架哪些品类，并说明原因。"
    )
    if not insight:
        insight = (
            f"近期热搜「{', '.join(keywords[:6]) or '暂无'}」中，"
            f"「{gap_text}」存在明显供给缺口，建议优先补货或上新对应品类，"
            "承接搜索流量、抢占蓝海。"
        )

    return TrendInsightOut(
        hot_keywords=keywords,
        demand_gap=demand_gap,
        suggested_categories=suggested_categories,
        rising_products=rising,
        insight=insight,
    )
