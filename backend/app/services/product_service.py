from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product, ProductStatus
from app.models.catalog import Category
from app.schemas.product import ProductCreate, ProductStatusUpdate, ProductUpdate
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
    in_stock: bool = False,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Product], int]:
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    base = select(Product)
    if only_active:
        base = base.where(Product.status == ProductStatus.ACTIVE)
    if category_id:
        base = base.where(Product.category_id == category_id)
    if keyword:
        like = f"%{keyword.strip()}%"
        base = base.where((Product.name.ilike(like)) | (Product.description.ilike(like)))
    if min_price is not None:
        base = base.where(Product.price >= min_price)
    if max_price is not None:
        base = base.where(Product.price <= max_price)
    if in_stock:
        base = base.where(Product.stock > 0)

    count_stmt = select(Product.id)
    if only_active:
        count_stmt = count_stmt.where(Product.status == ProductStatus.ACTIVE)
    if category_id:
        count_stmt = count_stmt.where(Product.category_id == category_id)
    if keyword:
        like = f"%{keyword.strip()}%"
        count_stmt = count_stmt.where((Product.name.ilike(like)) | (Product.description.ilike(like)))
    if min_price is not None:
        count_stmt = count_stmt.where(Product.price >= min_price)
    if max_price is not None:
        count_stmt = count_stmt.where(Product.price <= max_price)
    if in_stock:
        count_stmt = count_stmt.where(Product.stock > 0)
    # P2：直接数据库计数，避免先取全部 id 再 len()（大表会拉爆内存）
    total = await db.scalar(count_stmt.with_only_columns(func.count(Product.id))) or 0

    order = Product.created_at.desc()
    if sort == "price_asc":
        order = Product.price.asc()
    elif sort == "price_desc":
        order = Product.price.desc()
    elif sort == "sales":
        order = Product.sales_count.desc()
    elif sort == "newest":
        order = Product.created_at.desc()

    rows = await db.scalars(base.order_by(order).limit(page_size).offset((page - 1) * page_size))
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
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    await record(db, merchant_id, "product.update", "product", product.id, product.name)
    await db.commit()
    await db.refresh(product)
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
    product.status = data.status
    product.reject_reason = data.reject_reason if data.status == ProductStatus.REJECTED else None
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
