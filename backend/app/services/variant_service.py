import json

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from app.models.variant import ProductVariant, variant_to_dict
from app.schemas.variant import VariantCreate, VariantOut, VariantUpdate


async def list_variants(db: AsyncSession, product_id: str) -> list[dict]:
    rows = await db.scalars(
        select(ProductVariant)
        .where(ProductVariant.product_id == product_id)
        .order_by(ProductVariant.created_at)
    )
    return [variant_to_dict(v) for v in rows]


async def recompute_product_stock(db: AsyncSession, product_id: str) -> None:
    product = await db.get(Product, product_id)
    if not product:
        return
    variants = list(
        await db.scalars(select(ProductVariant).where(ProductVariant.product_id == product_id))
    )
    if variants:
        product.stock = sum(int(v.stock or 0) for v in variants)


async def create_variant(
    db: AsyncSession, *, merchant_id: str, product_id: str, data: VariantCreate
) -> VariantOut:
    product = await db.get(Product, product_id)
    if not product or product.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在或无权操作")
    v = ProductVariant(
        product_id=product_id,
        sku_code=data.sku_code,
        specs=json.dumps(data.specs, ensure_ascii=False),
        price_delta=data.price_delta,
        stock=data.stock,
        image_url=data.image_url,
    )
    db.add(v)
    await recompute_product_stock(db, product_id)
    await db.commit()
    await db.refresh(v)
    return VariantOut(**variant_to_dict(v))


async def update_variant(
    db: AsyncSession, *, merchant_id: str, variant_id: str, data: VariantUpdate
) -> VariantOut:
    v = await db.get(ProductVariant, variant_id)
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="规格不存在")
    product = await db.get(Product, v.product_id)
    if not product or product.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作")
    if data.sku_code is not None:
        v.sku_code = data.sku_code
    if data.specs is not None:
        v.specs = json.dumps(data.specs, ensure_ascii=False)
    if data.price_delta is not None:
        v.price_delta = data.price_delta
    if data.stock is not None:
        v.stock = data.stock
    if data.image_url is not None:
        v.image_url = data.image_url
    await recompute_product_stock(db, v.product_id)
    await db.commit()
    await db.refresh(v)
    return VariantOut(**variant_to_dict(v))


async def delete_variant(db: AsyncSession, *, merchant_id: str, variant_id: str) -> None:
    v = await db.get(ProductVariant, variant_id)
    if not v:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="规格不存在")
    product = await db.get(Product, v.product_id)
    if not product or product.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作")
    await db.delete(v)
    await recompute_product_stock(db, v.product_id)
    await db.commit()
