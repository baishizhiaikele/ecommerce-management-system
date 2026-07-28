from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.view import ProductView
from app.schemas.view import ViewLogIn


async def log_view(db: AsyncSession, *, user_id: str, payload: ViewLogIn) -> None:
    db.add(
        ProductView(
            user_id=user_id,
            product_id=payload.product_id,
            product_name=payload.product_name,
            price=payload.price,
            image_url=payload.image_url,
        )
    )
    await db.commit()


async def list_history(db: AsyncSession, user_id: str, limit: int = 30) -> list[ProductView]:
    rows = list(
        await db.scalars(
            select(ProductView)
            .where(ProductView.user_id == user_id)
            .order_by(ProductView.created_at.desc())
            .limit(limit * 3)
        )
    )
    seen, out = set(), []
    for r in rows:
        if r.product_id in seen:
            continue
        seen.add(r.product_id)
        out.append(r)
        if len(out) >= limit:
            break
    return out


async def recently_bought(db: AsyncSession, user_id: str, limit: int = 10) -> list[dict]:
    stmt = (
        select(OrderItem.product_id, func.count().label("cnt"))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.buyer_id == user_id)
        .where(
            Order.status.in_(
                [OrderStatus.PAID, OrderStatus.SHIPPED, OrderStatus.COMPLETED]
            )
        )
        .group_by(OrderItem.product_id)
        .order_by(func.count().desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    ids = [r.product_id for r in rows]
    names: dict[str, str] = {}
    if ids:
        prods = list(
            await db.scalars(select(Product).where(Product.id.in_(ids)))
        )
        names = {p.id: p.name for p in prods}
    return [
        {"product_id": r.product_id, "product_name": names.get(r.product_id, ""), "times": r.cnt}
        for r in rows
    ]
