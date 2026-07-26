from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.product import Product, ProductStatus
from app.models.review import Review
from app.models.user import Role, User
from app.schemas.product import ProductOut

router = APIRouter(prefix="/shops", tags=["shops"])


def _shop_product_ids(mid: str):
    return select(Product.id).where(Product.merchant_id == mid)


@router.get("")
async def list_shops(db: AsyncSession = Depends(get_db)) -> list:
    # 注意：scalars() 返回惰性 ScalarResult，只能迭代一次，必须转成 list
    merchants = list(
        await db.scalars(
            select(User).where(User.role == Role.MERCHANT, User.is_active == True)  # noqa: E712
        )
    )
    merchant_ids = [m.id for m in merchants]
    # 用一次分组聚合替代逐商家 COUNT 的 N+1 查询
    counts: dict[str, int] = {}
    ratings: dict[str, float] = {}
    if merchant_ids:
        rows = await db.execute(
            select(Product.merchant_id, func.count(Product.id))
            .where(Product.merchant_id.in_(merchant_ids), Product.status == ProductStatus.ACTIVE)
            .group_by(Product.merchant_id)
        )
        counts = {mid: c for mid, c in rows.all()}
        rrows = await db.execute(
            select(Product.merchant_id, func.coalesce(func.avg(Review.rating), 0.0))
            .join(Review, Review.product_id == Product.id)
            .where(Product.merchant_id.in_(merchant_ids))
            .group_by(Product.merchant_id)
        )
        ratings = {mid: round(float(r), 1) for mid, r in rrows.all()}
    return [
        {
            "id": m.id,
            "name": m.username,
            "avatar": m.avatar,
            "description": m.description,
            "rating": ratings.get(m.id, 0.0),
            "product_count": counts.get(m.id, 0),
        }
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
    sales_total = await db.scalar(
        select(func.coalesce(func.sum(Product.sales_count), 0)).where(
            Product.merchant_id == m.id
        )
    )
    rating = await db.scalar(
        select(func.coalesce(func.avg(Review.rating), 0.0)).where(
            Review.product_id.in_(_shop_product_ids(m.id))
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
        "avatar": m.avatar,
        "description": m.description,
        "rating": round(float(rating or 0), 1),
        "sales_total": int(sales_total or 0),
        "product_count": int(cnt or 0),
        "joined_at": m.created_at.isoformat() if m.created_at else None,
        "products": [ProductOut.model_validate(p) for p in products],
    }
