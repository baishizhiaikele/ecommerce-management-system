"""B4/B5：AI 首页编排 与 AI 选品/趋势洞察。

两项能力都遵循项目既有约定：
- 有 AI_API_KEY 时调用大模型生成洞察文案；
- 无 key（本地/CI）时返回确定性的 mock，保证接口可独立运行与测试。
"""

from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.catalog import Category
from app.models.search import SearchKeyword
from app.schemas.ai import FloorOut, HomeArrangeOut, TrendInsightOut
from app.schemas.product import ProductOut
from app.services.ai_service import ai_service
from app.services.product_service import list_products
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

# 身份优先级（决定楼层的基础排序）
_SEGMENT_PRIORITY: dict[str, list[str]] = {
    "new": ["categories", "coupon", "flash", "recommend", "top_sales", "shops", "top_rating", "theme", "recent"],
    "returning": ["recent", "recommend", "top_rating", "coupon", "flash", "top_sales", "shops", "categories", "theme"],
    "member": ["coupon", "recommend", "top_rating", "flash", "top_sales", "shops", "recent", "categories", "theme"],
}
_DEFAULT_ORDER = ["categories", "coupon", "flash", "top_sales", "top_rating", "recommend", "recent", "shops", "theme"]

# 时段 -> 给特定楼层的提前量（越小越靠前）
_PHASE_BOOST: dict[str, dict[str, int]] = {
    "morning": {"categories": -3, "flash": -2, "coupon": -1},
    "noon": {"recommend": -3, "shops": -2},
    "afternoon": {"top_sales": -2, "shops": -1},
    "evening": {"recommend": -3, "coupon": -2, "top_rating": -1},
    "night": {"recommend": -3, "recent": -2},
    "late_night": {"recommend": -3, "recent": -2},
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


async def arrange_home(db: AsyncSession, segment: str, hour: int | None) -> HomeArrangeOut:
    """按身份与时段编排首页楼层顺序。"""
    segment = segment if segment in _SEGMENT_PRIORITY else "buyer"
    if hour is None:
        hour = datetime.now().hour
    hour = max(0, min(23, hour))
    phase = _phase_of(hour)
    base_order = _SEGMENT_PRIORITY.get(segment, _DEFAULT_ORDER)
    boost = _PHASE_BOOST.get(phase, {})

    # 计算排序分：基础顺序 + 时段提前量，稳定排序
    scored = sorted(
        base_order,
        key=lambda k: base_order.index(k) + boost.get(k, 0),
    )

    floors = [
        FloorOut(key=k, title=_ALL_FLOORS[k], reason=_REASON.get(k, "贴合当前场景"))
        for k in scored
    ]

    insight = await ai_service.generate_text(
        "你是电商首页体验师。请用一句中文（40字内）说明：为何针对"
        f"「{_SEGMENT_LABEL.get(segment, segment)}」用户在「{_PHASE_LABEL[phase]}」"
        f"优先展示这些首页楼层：{', '.join(_ALL_FLOORS[k] for k in scored[:4])}。"
    )
    if not insight:
        top3 = "、".join(_ALL_FLOORS[k] for k in scored[:3])
        insight = (
            f"已为「{_SEGMENT_LABEL.get(segment, segment)}」在「{_PHASE_LABEL[phase]}」"
            f"智能编排：优先展示 {top3} 等楼层，贴合当前身份与时段偏好。"
        )

    return HomeArrangeOut(segment=segment, hour=hour, floors=floors, insight=insight)


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
