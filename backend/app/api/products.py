from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

import hashlib
import json

from app.core.deps import (
    MerchantCtx,
    get_merchant_product,
    require_merchant,
    require_role,
)
from app.db.session import get_db
from app.models.product import Product
from app.models.user import Role, User
from app.schemas.product import (
    AIGenerateRequest,
    AIGenerateResult,
    MarketingRequest,
    MarketingResult,
    PriceAdviceRequest,
    PriceAdviceResult,
    ProductCreate,
    ProductOut,
    ProductStatusUpdate,
    ProductUpdate,
)
from app.services import product_service
from app.services.image_service import generate_images
from app.services import price_compare_service
from app.core.cache import cache_get, cache_set, cache_delete_prefix

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
async def list_products(
    response: Response,
    db: AsyncSession = Depends(get_db),
    category_id: str | None = None,
    keyword: str | None = None,
    sort: str | None = Query(None, description="price_asc|price_desc|sales|newest"),
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    min_rating: float | None = Query(None, ge=0, le=5),
    in_stock: bool = False,
    merchant_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> list[Product]:
    raw_params = {
        "category_id": category_id,
        "keyword": keyword,
        "sort": sort,
        "min_price": min_price,
        "max_price": max_price,
        "min_rating": min_rating,
        "in_stock": in_stock,
        "merchant_id": merchant_id,
        "page": page,
        "page_size": page_size,
    }
    cache_key = "products:list:" + hashlib.md5(
        json.dumps(raw_params, sort_keys=True, default=str).encode()
    ).hexdigest()
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    items, total = await product_service.list_products(
        db,
        category_id=category_id,
        keyword=keyword,
        sort=sort,
        min_price=min_price,
        max_price=max_price,
        min_rating=min_rating,
        in_stock=in_stock,
        merchant_id=merchant_id,
        page=page,
        page_size=page_size,
    )
    # 统一分页 meta（P1-5）：以响应头暴露总数/页码，兼容现有前端契约
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    await cache_set(cache_key, [ProductOut.model_validate(it).model_dump() for it in items], ttl=60)
    return items


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)) -> Product:
    cached = await cache_get(f"products:detail:{product_id}")
    if cached is not None:
        return cached
    product = await product_service.get_product(db, product_id)
    await cache_set(f"products:detail:{product_id}", ProductOut.model_validate(product).model_dump(), ttl=60)
    return product


@router.post("", response_model=ProductOut, status_code=201)
async def create_product(
    data: ProductCreate,
    db: AsyncSession = Depends(get_db),
    ctx: MerchantCtx = Depends(require_merchant("products")),
) -> Product:
    product = await product_service.create_product(db, merchant_id=ctx.owner_id, data=data)
    await cache_delete_prefix("products:")
    return product


@router.put("/{product_id}", response_model=ProductOut)
async def update_product(
    product: Product = Depends(get_merchant_product),
    data: ProductUpdate = ...,
    db: AsyncSession = Depends(get_db),
) -> Product:
    product = await product_service.update_product(
        db, product=product, merchant_id=product.merchant_id, data=data
    )
    await cache_delete_prefix("products:")
    return product


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product: Product = Depends(get_merchant_product),
    db: AsyncSession = Depends(get_db),
) -> None:
    await product_service.delete_product(db, product=product, merchant_id=product.merchant_id)
    await cache_delete_prefix("products:")


@router.post("/{product_id}/ai-generate", response_model=AIGenerateResult)
async def ai_generate(
    data: AIGenerateRequest,
    product: Product = Depends(get_merchant_product),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await product_service.ai_generate(
        db, product=product, merchant_id=product.merchant_id, note=data.note
    )


@router.patch("/{product_id}/status", response_model=ProductOut)
async def set_status(
    product_id: str,
    data: ProductStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.ADMIN)),
) -> Product:
    product = await product_service.get_product(db, product_id)
    product = await product_service.set_status(db, product=product, admin_id=user.id, data=data)
    await cache_delete_prefix("products:")
    return product


@router.post("/{product_id}/ai-marketing", response_model=MarketingResult)
async def ai_marketing(
    data: MarketingRequest,
    product: Product = Depends(get_merchant_product),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await product_service.ai_marketing_copy(
        db, product=product, merchant_id=product.merchant_id, platform=data.platform, note=data.note
    )


@router.post("/{product_id}/ai-price-advice", response_model=PriceAdviceResult)
async def ai_price_advice(
    data: PriceAdviceRequest,
    product: Product = Depends(get_merchant_product),
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await product_service.ai_price_advice(
        db, product=product, merchant_id=product.merchant_id, market_price=data.market_price, note=data.note
    )


@router.get("/{product_id}/price-compare")
async def price_compare(
    product: Product = Depends(get_merchant_product),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """AI 比价：横向对比同类竞品价格并给出调价建议。"""
    return await price_compare_service.compare_price(db, product)


@router.post("/{product_id}/ai-image")
async def ai_image(
    product: Product = Depends(get_merchant_product),
    db: AsyncSession = Depends(get_db),
    count: int = Query(4, ge=1, le=8),
    apply: bool = Query(False, description="为 true 时将首张自动设为商品主图"),
) -> dict:
    """AI 文生图：生成候选主图 / 场景图（未配置网关时降级为占位图）。"""
    prompt = f"{product.name}。{product.description or ''}"
    urls = await generate_images(prompt, count)
    if apply and urls:
        product.image_url = urls[0]
        await db.commit()
        await cache_delete_prefix("products:")
    return {"images": urls, "applied": bool(apply and urls)}
