from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db.session import get_db
from app.models.order import Order, OrderItem
from app.models.product import Product, ProductStatus
from app.models.user import Role, User
from app.schemas.dashboard import MerchantAnalytics, MerchantStats, TrendPoint
from app.schemas.product import ProductOut
import csv
import io

from app.services import dashboard_service

router = APIRouter(prefix="/merchant", tags=["merchant"])


@router.get("/reports/orders")
async def export_orders(
    db: AsyncSession = Depends(get_db), user: User = Depends(require_role(Role.MERCHANT))
) -> StreamingResponse:
    """导出商家相关订单为 CSV（含 UTF-8 BOM，Excel 可直接打开）。"""
    order_ids = await db.scalars(
        select(OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Product.merchant_id == user.id)
        .distinct()
    )
    ids = list(order_ids)
    orders = []
    if ids:
        orders = list(
            await db.scalars(
                select(Order).where(Order.id.in_(ids)).order_by(Order.created_at.desc())
            )
        )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["订单号", "下单时间", "状态", "金额", "优惠", "收货地址"])
    for o in orders:
        writer.writerow(
            [
                o.order_no,
                o.created_at.strftime("%Y-%m-%d %H:%M"),
                o.status.value,
                float(o.total_amount),
                float(o.discount_amount),
                o.address or "",
            ]
        )
    content = "\ufeff" + buf.getvalue()
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"},
    )


@router.get("/reports/orders/pdf")
async def export_orders_pdf(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
):
    """导出订单 PDF（P2-19）。依赖 reportlab，未安装时返回 501。"""
    from app.models.merchant import Merchant

    merchant = await db.scalar(select(Merchant).where(Merchant.user_id == user.id))
    if not merchant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商家不存在")

    order_ids = list(
        await db.scalars(
            select(OrderItem.order_id)
            .join(Product, Product.id == OrderItem.product_id)
            .where(Product.merchant_id == user.id)
            .distinct()
        )
    )
    orders = []
    if order_ids:
        orders = list(
            await db.scalars(
                select(Order)
                .where(Order.id.in_(order_ids))
                .order_by(Order.created_at.desc())
                .limit(500)
            )
        )

    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="服务端未安装 PDF 依赖（reportlab）",
        )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    data = [["订单号", "下单时间", "状态", "金额", "优惠"]]
    for o in orders:
        data.append(
            [
                o.order_no,
                o.created_at.strftime("%Y-%m-%d %H:%M"),
                o.status.value if hasattr(o.status, "value") else str(o.status),
                f"{float(o.total_amount):.2f}",
                f"{float(o.discount_amount):.2f}",
            ]
        )
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
            ]
        )
    )
    doc.build([table])
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=orders.pdf"},
    )


@router.get("/dashboard/stats", response_model=MerchantStats)
async def stats(
    db: AsyncSession = Depends(get_db), user: User = Depends(require_role(Role.MERCHANT))
) -> MerchantStats:
    return await dashboard_service.merchant_stats(db, user.id)


@router.get("/dashboard/trend", response_model=list[TrendPoint])
async def trend(
    days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list[TrendPoint]:
    return await dashboard_service.sales_trend(db, merchant_id=user.id, days=days)


@router.get("/dashboard/analytics", response_model=MerchantAnalytics)
async def analytics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> MerchantAnalytics:
    return await dashboard_service.merchant_analytics(db, user.id)


@router.get("/dashboard/gmv-by-period")
async def gmv_by_period(
    period: str = Query("day", pattern="^(day|week|month)$"),
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list[dict]:
    """P1-8 看板下钻：GMV 按日/周/月维度拆解。"""
    return await dashboard_service.gmv_by_period(db, merchant_id=user.id, period=period, days=days)


@router.get("/dashboard/category-detail")
async def category_detail(
    category_id: str | None = None,
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list[dict]:
    """P1-8 看板下钻：品类 Top 商品（销量/GMV/占比）。"""
    return await dashboard_service.category_detail(db, merchant_id=user.id, category_id=category_id, limit=limit)


@router.get("/products", response_model=list[ProductOut])
async def my_products(
    db: AsyncSession = Depends(get_db), user: User = Depends(require_role(Role.MERCHANT))
) -> list[ProductOut]:
    rows = await db.scalars(
        select(Product).where(Product.merchant_id == user.id).order_by(Product.created_at.desc())
    )
    return list(rows)
