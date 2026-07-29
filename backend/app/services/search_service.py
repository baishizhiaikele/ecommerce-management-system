import re

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import httpx

from app.core.config import settings
from app.models.catalog import Category
from app.models.product import Product, ProductStatus
from app.models.review import Review
from app.models.search import SearchKeyword
from app.schemas.product import ProductOut
from app.services import product_service


async def record_keyword(db: AsyncSession, raw: str) -> None:
    kw = (raw or "").strip()
    if len(kw) < 2:
        return
    obj = await db.get(SearchKeyword, kw)
    if obj:
        obj.count += 1
    else:
        obj = SearchKeyword(keyword=kw, count=1)
        db.add(obj)
    await db.commit()


async def top_keywords(db: AsyncSession, *, limit: int = 10) -> list[str]:
    rows = await db.scalars(
        select(SearchKeyword)
        .order_by(SearchKeyword.count.desc(), SearchKeyword.last_searched.desc())
        .limit(limit)
    )
    return [r.keyword for r in rows]


# ---------------------------------------------------------------------------
# AI 智能搜索问答（P1 差异化）：自然语言 → 结构化筛选 → 商品召回
# ---------------------------------------------------------------------------

_RANGE = re.compile(r"(\d+(?:\.\d+)?)\s*[-到~]\s*(\d+(?:\.\d+)?)")
_MAX = re.compile(r"(\d+(?:\.\d+)?)\s*以内|不超过\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*以下|低于\s*(\d+(?:\.\d+)?)")
_MIN = re.compile(r"(\d+(?:\.\d+)?)\s*以上|超过\s*(\d+(?:\.\d+)?)|高于\s*(\d+(?:\.\d+)?)")


async def _mock_parse(db: AsyncSession, question: str) -> dict:
    """无网关时的本地解析：识别价格区间与类目关键词。"""
    filters = {
        "keyword": None,
        "min_price": None,
        "max_price": None,
        "category_id": None,
        "category": None,
    }
    q = question
    m = _RANGE.search(q)
    if m:
        filters["min_price"], filters["max_price"] = float(m.group(1)), float(m.group(2))
        q = q.replace(m.group(0), " ")
    for pat in (_MAX, _MIN):
        m = pat.search(q)
        if m:
            val = float(m.group(1) or m.group(2) or m.group(3))
            if pat is _MAX:
                filters["max_price"] = val
            else:
                filters["min_price"] = val
            q = q.replace(m.group(0), " ")
            break
    cats = (await db.scalars(select(Category))).all()
    for c in cats:
        if c.name and c.name in q:
            filters["category_id"], filters["category"] = c.id, c.name
            q = q.replace(c.name, " ")
            break
    kw = re.sub(r"[^\w\u4e00-\u9fa5]+", " ", q).strip()
    filters["keyword"] = kw or None
    return filters


async def _ai_parse(db: AsyncSession, question: str) -> dict:
    """调用 LLM 抽取结构化筛选条件（category / 价格区间 / 关键词）。"""
    cats = (await db.scalars(select(Category))).all()
    cat_names = "、".join(c.name for c in cats if c.name)
    prompt = (
        "你是电商搜索助手。从用户问题中抽取筛选条件，仅输出 JSON："
        '{"category": 类目名或null, "min_price": 数字或null, "max_price": 数字或null, "keyword": 精简关键词或null}。'
        f"可选类目：{cat_names}。用户问题：{question}"
    )
    try:
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            resp = await client.post(
                f"{settings.AI_BASE_URL.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.AI_API_KEY}"},
                json={
                    "model": settings.AI_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            import json

            data = json.loads(resp.json()["choices"][0]["message"]["content"])
        cat = data.get("category")
        cat_id = None
        if cat:
            for c in cats:
                if c.name == cat:
                    cat_id = c.id
                    break
        return {
            "keyword": data.get("keyword"),
            "min_price": data.get("min_price"),
            "max_price": data.get("max_price"),
            "category_id": cat_id,
            "category": cat if cat_id else None,
        }
    except Exception:
        return await _mock_parse(db, question)


async def search_qa(db: AsyncSession, question: str, user_id: str | None = None) -> dict:
    """自然语言问答式搜索：解析 → 召回商品 → 生成自然语言答案。"""
    if settings.AI_API_KEY:
        filters = await _ai_parse(db, question)
    else:
        filters = await _mock_parse(db, question)

    items, total = await product_service.list_products(
        db,
        keyword=filters["keyword"],
        category_id=filters["category_id"],
        min_price=filters["min_price"],
        max_price=filters["max_price"],
        page=1,
        page_size=20,
    )

    parts = []
    if filters["category"]:
        parts.append(f"「{filters['category']}」类目")
    if filters["min_price"] is not None:
        parts.append(f"价格≥{filters['min_price']}")
    if filters["max_price"] is not None:
        parts.append(f"价格≤{filters['max_price']}")
    cond = "、".join(parts) or "全部商品"
    kw_tip = f"关键词「{filters['keyword']}」" if filters["keyword"] else ""
    answer = f"已为您在{cond}中筛选，共找到 {total} 件相关商品。{kw_tip}"

    return {
        "question": question,
        "answer": answer,
        "filters": filters,
        "products": [ProductOut.model_validate(p).model_dump() for p in items],
        "total": total,
    }


async def facets(
    db: AsyncSession,
    *,
    keyword: str | None = None,
    category_id: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
) -> dict:
    """分面检索数据（P1-6）：类目计数 / 价格区间 / 评分分桶 / 排序选项。

    评分分桶统计「平均评分 >= 阈值」的商品数；类目分面不叠加 category_id
    过滤，便于用户在前端切换类目。
    """
    kw_min_max = []
    if keyword:
        kw_min_max.append(Product.name.ilike(f"%{keyword}%"))
    if min_price is not None:
        kw_min_max.append(Product.price >= min_price)
    if max_price is not None:
        kw_min_max.append(Product.price <= max_price)

    cat_rows = await db.execute(
        select(Category.id, Category.name, func.count(Product.id))
        .select_from(Product)
        .join(Category, Category.id == Product.category_id)
        .where(Product.status == ProductStatus.ACTIVE, *kw_min_max)
        .group_by(Category.id, Category.name)
    )
    categories = [{"id": r[0], "name": r[1], "count": r[2]} for r in cat_rows.all()]

    price_stmt = select(func.min(Product.price), func.max(Product.price)).where(
        Product.status == ProductStatus.ACTIVE, *kw_min_max
    )
    if category_id:
        price_stmt = price_stmt.where(Product.category_id == category_id)
    pmin, pmax = (await db.execute(price_stmt)).first() or (None, None)

    avg_sub = (
        select(Review.product_id, func.avg(Review.rating).label("avg_rating"))
        .group_by(Review.product_id)
        .subquery()
    )
    rating_buckets: dict[str, int] = {}
    for thr in (4.5, 4.0, 3.0):
        cnt = await db.scalar(
            select(func.count(func.distinct(Product.id)))
            .select_from(Product)
            .join(avg_sub, avg_sub.c.product_id == Product.id)
            .where(
                Product.status == ProductStatus.ACTIVE,
                *kw_min_max,
                avg_sub.c.avg_rating >= thr,
            )
        )
        rating_buckets[str(thr)] = int(cnt or 0)

    return {
        "categories": categories,
        "price_min": float(pmin) if pmin is not None else 0.0,
        "price_max": float(pmax) if pmax is not None else 0.0,
        "rating_buckets": rating_buckets,
        "sorts": [
            {"value": "newest", "label": "最新"},
            {"value": "price_asc", "label": "价格升序"},
            {"value": "price_desc", "label": "价格降序"},
            {"value": "sales", "label": "销量"},
        ],
    }


async def suggest(db: AsyncSession, q: str, limit: int = 8) -> list[str]:
    """搜索联想（P1-7）：热门关键词前缀匹配，不足时补充商品名包含匹配。"""
    q = (q or "").strip()
    if len(q) < 1:
        return []
    rows = await db.scalars(
        select(SearchKeyword.keyword)
        .where(SearchKeyword.keyword.ilike(f"{q}%"))
        .order_by(SearchKeyword.count.desc())
        .limit(limit)
    )
    out = list(rows)
    if len(out) < limit:
        extra = await db.scalars(
            select(Product.name)
            .where(Product.status == ProductStatus.ACTIVE, Product.name.ilike(f"%{q}%"))
            .limit(limit - len(out))
        )
        seen: set[str] = set(out)
        for n in extra:
            if n not in seen:
                out.append(n)
                seen.add(n)
    return out[:limit]
