from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.product import Product, ProductStatus
from app.models.user import Role, User
from app.schemas.product import ProductOut

router = APIRouter(prefix="/shops", tags=["shops"])


@router.get("")
async def list_shops(db: AsyncSession = Depends(get_db)) -> list:
    # 注意：scalars() 返回惰性 ScalarResult，只能迭代一次，必须转成 list
    merchants = list(
        await db.scalars(
            select(User).where(User.role == Role.MERCHANT, User.is_active == True)  # noqa: E712
        )
    )
    merchant_ids = [m.id for m in merchants]
    # P1：用一次分组聚合替代逐商家 COUNT 的 N+1 查询
    counts: dict[str, int] = {}
    if merchant_ids:
        rows = await db.execute(
            select(Product.merchant_id, func.count(Product.id))
            .where(Product.merchant_id.in_(merchant_ids), Product.status == ProductStatus.ACTIVE)
            .group_by(Product.merchant_id)
        )
        counts = {mid: c for mid, c in rows.all()}
    return [
        {"id": m.id, "name": m.username, "product_count": counts.get(m.id, 0)}
        for m in merchants
    ]


@router.get("/{merchant_id}")
async def shop_detail(merchant_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    m = await db.get(User, merchant_id)
    if not m or m.role != Role.MERCHANT:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="店铺不存在")
    cnt = await db.scalar(
        select(func.count(Product.id)).where(
            Product.merchant_id == m.id, Product.status == ProductStatus.ACTIVE
        )
    )
    products = await db.scalars(
        select(Product)
        .where(Product.merchant_id == m.id, Product.status == ProductStatus.ACTIVE)
        .order_by(Product.created_at.desc())
        .limit(60)
    )
    return {
        "id": m.id,
        "name": m.username,
        "product_count": int(cnt or 0),
        "products": [ProductOut.model_validate(p) for p in products],
    }
