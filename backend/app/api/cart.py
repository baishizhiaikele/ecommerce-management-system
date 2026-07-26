from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api._product_snapshot import load_product_map, snapshot_name
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.cart import CartItem
from app.models.product import Product, ProductStatus
from app.models.variant import ProductVariant
from app.models.user import User
from app.schemas.cart import CartItemAdd, CartItemOut, CartItemUpdate
from app.services.audit_service import record

router = APIRouter(prefix="/cart", tags=["cart"])


def _serialize(item: CartItem, snapshot: dict) -> CartItemOut:
    product = snapshot.get(item.product_id)
    return CartItemOut(
        id=item.id,
        product_id=item.product_id,
        name=snapshot_name(snapshot, item.product_id),
        price=product.price if product else 0,
        image_url=product.image_url if product else None,
        stock=product.stock if product else 0,
        quantity=item.quantity,
        variant_id=item.variant_id,
    )


@router.get("", response_model=list[CartItemOut])
async def get_cart(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[CartItemOut]:
    rows = list(await db.scalars(select(CartItem).where(CartItem.user_id == user.id)))
    snapshot = await load_product_map(db, [it.product_id for it in rows])
    return [_serialize(it, snapshot) for it in rows]


@router.post("/items", response_model=CartItemOut, status_code=201)
async def add_item(
    data: CartItemAdd,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CartItemOut:
    product = await db.get(Product, data.product_id)
    if not product or product.status != ProductStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不可购买")
    # 校验并锁定库存来源：优先使用规格库存
    variant = None
    if data.variant_id:
        variant = await db.get(ProductVariant, data.variant_id)
        if not variant or variant.product_id != product.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="规格不存在")
        if variant.stock < data.quantity:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="规格库存不足")
    else:
        if product.stock < data.quantity:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="库存不足")
    existing = await db.scalar(
        select(CartItem).where(
            (CartItem.user_id == user.id)
            & (CartItem.product_id == data.product_id)
            & (CartItem.variant_id == data.variant_id)
        )
    )
    if existing:
        new_qty = min(existing.quantity + data.quantity, 99)
        await record(db, user.id, "cart.add", "cart", existing.id, f"商品 {product.id} x{new_qty}")
        await db.commit()
        return _serialize(existing, {product.id: product})
    item = CartItem(
        user_id=user.id,
        product_id=data.product_id,
        quantity=data.quantity,
        variant_id=data.variant_id,
    )
    db.add(item)
    await record(db, user.id, "cart.add", "cart", item.id, f"商品 {data.product_id} x{data.quantity}")
    await db.commit()
    return _serialize(item, {product.id: product})


@router.put("/items/{item_id}", response_model=CartItemOut)
async def update_item(
    item_id: str,
    data: CartItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CartItemOut:
    item = await db.get(CartItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="购物车项不存在")
    product = await db.get(Product, item.product_id)
    if product and product.stock < data.quantity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="库存不足")
    item.quantity = data.quantity
    await record(db, user.id, "cart.update", "cart", item.id, f"数量->{data.quantity}")
    await db.commit()
    return _serialize(item, {product.id: product} if product else {})


@router.delete("/items/{item_id}", status_code=204)
async def remove_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    item = await db.get(CartItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="购物车项不存在")
    await record(db, user.id, "cart.remove", "cart", item.id)
    await db.delete(item)
    await db.commit()
