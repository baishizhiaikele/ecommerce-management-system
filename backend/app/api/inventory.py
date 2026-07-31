from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db.session import get_db
from app.models.product import Product
from app.models.user import Role, User
from app.schemas.inventory import StockAdjustIn, StockLogOut, StockSummaryOut
from app.services import inventory_service
from app.services.replenishment_service import restock_suggestions

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.get("/summary", response_model=StockSummaryOut)
async def get_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> StockSummaryOut:
    data = await inventory_service.summary(db, merchant_id=user.id)
    return StockSummaryOut(**data)


@router.get("/low-stock", response_model=list[dict])
async def get_low_stock(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list[dict]:
    rows = await inventory_service.low_stock_products(db, merchant_id=user.id)
    return [
        {"id": p.id, "name": p.name, "stock": p.stock, "price": float(p.price)}
        for p in rows
    ]


@router.get("/logs", response_model=list[StockLogOut])
async def list_logs(
    db: AsyncSession = Depends(get_db),
    product_id: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list[StockLogOut]:
    logs = await inventory_service.list_logs(
        db, merchant_id=user.id, product_id=product_id, limit=limit
    )
    # P2-M5：批量预取商品名，消除逐条日志查库的 N+1
    pids = {log.product_id for log in logs if log.product_id}
    pmap = (
        {p.id: p.name for p in await db.scalars(select(Product).where(Product.id.in_(pids)))}
        if pids
        else {}
    )
    out = []
    for log in logs:
        out.append(
            StockLogOut(
                id=log.id,
                product_id=log.product_id,
                product_name=pmap.get(log.product_id),
                change_type=log.change_type,
                quantity=log.quantity,
                balance_after=log.balance_after,
                remark=log.remark,
                created_at=log.created_at,
            )
        )
    return out


@router.get("/restock-suggestions", response_model=list[dict])
async def get_restock_suggestions(
    days: int = Query(30, ge=7, le=365),
    only_urgent: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list[dict]:
    """P1-9 智能补货：基于近 days 天销量与安全库存生成补货建议单。"""
    return await restock_suggestions(db, merchant_id=user.id, days=days, only_urgent=only_urgent)


@router.post("/adjust", response_model=StockLogOut, status_code=201)
async def adjust(
    data: StockAdjustIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> StockLogOut:
    log = await inventory_service.adjust(
        db,
        merchant=user,
        product_id=data.product_id,
        quantity=data.quantity,
        change_type=data.change_type,
        remark=data.remark,
    )
    product = await db.get(Product, log.product_id)
    return StockLogOut(
        id=log.id,
        product_id=log.product_id,
        product_name=product.name if product else None,
        change_type=log.change_type,
        quantity=log.quantity,
        balance_after=log.balance_after,
        remark=log.remark,
        created_at=log.created_at,
    )
