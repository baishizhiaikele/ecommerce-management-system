from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product, ProductStatus
from app.models.catalog import Category
from app.models.review import Review


async def _expand_category(db: AsyncSession, pid: str) -> list:
    """展开一级分类为其自身 + 全部子类 id 列表。"""
    all_cats = (await db.scalars(select(Category))).all()
    children_map: dict = {}
    for c in all_cats:
        children_map.setdefault(c.parent_id, []).append(c.id)

    def _desc(p: str) -> list:
        ids: list = []
        for cid in children_map.get(p, []):
            ids.append(cid)
            ids.extend(_desc(cid))
        return ids

    return [pid, *_desc(pid)]
from app.schemas.product import ProductCreate, ProductStatusUpdate, ProductUpdate
from app.events import bus
from app.services import follow_service
from app.services.ai_service import ai_service
from app.services.audit_service import record


async def list_products(
    db: AsyncSession,
    *,
    only_active: bool = True,
    category_id: str | None = None,
    keyword: str | None = None,
    sort: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    min_rating: float | None = None,
    in_stock: bool = False,
    merchant_id: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Product], int]:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    # 评分过滤子查询（min_rating），供计数与取数共用
    rating_filter_ids = None
    if min_rating is not None:
        _avg = (
            select(Review.product_id, func.avg(Review.rating).label("avg_rating"))
            .group_by(Review.product_id)
            .subquery()
        )
        rating_filter_ids = select(_avg.c.product_id).where(_avg.c.avg_rating >= min_rating)

    cat_ids: list | None = None
    if category_id:
        cat_ids = await _expand_category(db, category_id)

    # B7：过滤条件仅构造一次，计数与取数复用，避免两处重复且容易漂移
    def _apply_filters(stmt):
        if only_active:
            stmt = stmt.where(Product.status == ProductStatus.ACTIVE)
        if merchant_id:
            stmt = stmt.where(Product.merchant_id == merchant_id)
        if cat_ids is not None:
            stmt = stmt.where(Product.category_id.in_(cat_ids))
        if keyword:
            like = f"%{keyword.strip()}%"
            stmt = stmt.where((Product.name.ilike(like)) | (Product.description.ilike(like)))
        if min_price is not None:
            stmt = stmt.where(Product.price >= min_price)
        if max_price is not None:
            stmt = stmt.where(Product.price <= max_price)
        if in_stock:
            stmt = stmt.where(Product.stock > 0)
        if rating_filter_ids is not None:
            stmt = stmt.where(Product.id.in_(rating_filter_ids))
        return stmt

    filtered = _apply_filters(select(Product))
    # P2：直接数据库计数，避免先取全部 id 再 len()（大表会拉爆内存）
    total = await db.scalar(select(func.count()).select_from(filtered.subquery())) or 0

    # B5：相关性排序（含关键词时默认）。标题命中权重高于描述命中，再按销量兜底
    if (sort in (None, "relevance")) and keyword:
        kw = keyword.strip()
        title_hit = Product.name.ilike(f"%{kw}%")
        desc_hit = Product.description.ilike(f"%{kw}%")
        relevance = case((title_hit, 2), else_=0) + case((desc_hit, 1), else_=0)
        order = (relevance * 1000 + Product.sales_count).desc()
    else:
        order = Product.created_at.desc()
        if sort == "price_asc":
            order = Product.price.asc()
        elif sort == "price_desc":
            order = Product.price.desc()
        elif sort == "sales":
            order = Product.sales_count.desc()
        elif sort == "top_rating":
            rating_subq = (
                select(func.coalesce(func.avg(Review.rating), 0.0))
                .where(Review.product_id == Product.id)
                .correlate(Product)
                .scalar_subquery()
            )
            order = rating_subq.desc()
        elif sort == "newest":
            order = Product.created_at.desc()
        elif sort == "relevance":
            # 无关键词时相关性无意义，退回最新
            order = Product.created_at.desc()

    rows = await db.scalars(filtered.order_by(order).limit(page_size).offset((page - 1) * page_size))
    items = list(rows)
    return items, total


async def get_product(db: AsyncSession, product_id: str) -> Product:
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在")
    return product


async def create_product(
    db: AsyncSession, *, merchant_id: str, data: ProductCreate
) -> Product:
    product = Product(
        merchant_id=merchant_id,
        category_id=data.category_id,
        name=data.name,
        description=data.description,
        price=data.price,
        stock=data.stock,
        image_url=data.image_url,
        status=ProductStatus.DRAFT,
    )
    db.add(product)
    await db.flush()
    await record(db, merchant_id, "product.create", "product", product.id, data.name)
    await db.commit()
    await db.refresh(product)
    return product


async def update_product(
    db: AsyncSession, *, product: Product, merchant_id: str, data: ProductUpdate
) -> Product:
    if product.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能修改自己的商品")
    raw = data.model_dump(exclude_unset=True)
    old_price = product.price
    for field, value in raw.items():
        setattr(product, field, value)
    await record(db, merchant_id, "product.update", "product", product.id, product.name)
    # 降价动态：写入关注流事件（与主事务一并提交）
    if "price" in raw and product.price < old_price:
        await follow_service.record_shop_event(
            db,
            merchant_id=merchant_id,
            event_type="price_drop",
            product_id=product.id,
            product_name=product.name,
            image_url=product.image_url,
            old_price=old_price,
            new_price=product.price,
            commit=False,
        )
    await db.commit()
    await db.refresh(product)
    # 降价提醒：价格下降时发布事件，由事件总线通知收藏该商品的用户
    if "price" in raw and product.price < old_price:
        await bus.publish(
            "product.price_changed",
            product_id=product.id,
            old_price=old_price,
            new_price=product.price,
        )
    return product


async def delete_product(db: AsyncSession, *, product: Product, merchant_id: str) -> None:
    if product.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能删除自己的商品")
    await record(db, merchant_id, "product.delete", "product", product.id, product.name)
    await db.delete(product)
    await db.commit()


async def ai_generate(
    db: AsyncSession, *, product: Product, merchant_id: str, note: str | None
) -> dict:
    if product.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能为自己的商品生成文案")
    category_name = await _category_name(db, product)
    result = await ai_service.generate_product_copy(
        name=product.name,
        category=category_name,
        note=note or "",
    )
    product.ai_title = result["title"]
    product.ai_copy = result["sales_copy"]
    product.ai_price_suggestion = result["price_suggestion"]
    await record(db, merchant_id, "product.ai_generate", "product", product.id, product.name)
    await db.commit()
    await db.refresh(product)
    return result


async def set_status(
    db: AsyncSession, *, product: Product, admin_id: str, data: ProductStatusUpdate
) -> Product:
    was_active = product.status == ProductStatus.ACTIVE
    product.status = data.status
    product.reject_reason = data.reject_reason if data.status == ProductStatus.REJECTED else None
    # 上新动态：首次通过审核上架时写入关注流事件
    if data.status == ProductStatus.ACTIVE and not was_active:
        await follow_service.record_shop_event(
            db,
            merchant_id=product.merchant_id,
            event_type="new_product",
            product_id=product.id,
            product_name=product.name,
            image_url=product.image_url,
            new_price=product.price,
            commit=False,
        )
    await record(
        db,
        admin_id,
        f"product.{data.status.value}",
        "product",
        product.id,
        product.reject_reason or product.name,
    )
    await db.commit()
    await db.refresh(product)
    return product


async def _category_name(db: AsyncSession, product: Product) -> str:
    """取商品分类名称，无分类时返回通用占位（供 AI 文案/定价复用）。"""
    if product.category_id:
        category = await db.get(Category, product.category_id)
        if category:
            return category.name
    return "通用"


async def ai_marketing_copy(
    db: AsyncSession, *, product: Product, merchant_id: str, platform: str, note: str | None
) -> dict:
    if product.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能为自己的商品生成营销文案")
    category = await _category_name(db, product)
    copy = await ai_service.generate_marketing_copy(
        product.name, category, note or product.description or "", platform
    )
    return {"platform": platform, "content": copy}


async def ai_price_advice(
    db: AsyncSession, *, product: Product, merchant_id: str, market_price: float | None, note: str | None
) -> dict:
    if product.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能为自己的商品提供估价建议")
    category = await _category_name(db, product)
    return await ai_service.price_advice(
        product.name, category, note or product.description or "", market_price
    )
