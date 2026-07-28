"""电子发票业务：订单开票（演示级即时开具，支持 PDF 导出）。"""
import io
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice, InvoiceTitleType
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.schemas.invoice import InvoiceOut

# 已支付及之后的状态可开票（取消/待支付不可）
INVOICEABLE = {
    OrderStatus.PAID,
    OrderStatus.SHIPPED,
    OrderStatus.COMPLETED,
}


def _invoice_no() -> str:
    return f"INV{datetime.now(timezone.utc).strftime('%Y%m%d')}{uuid.uuid4().hex[:8].upper()}"


async def apply_invoice(
    db: AsyncSession,
    *,
    buyer_id: str,
    order_id: str,
    title_type: str,
    title: str,
    tax_no: str | None,
) -> InvoiceOut:
    order = await db.get(Order, order_id)
    if not order or order.buyer_id != buyer_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="订单不存在")
    if order.status not in INVOICEABLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="当前订单状态不可开票"
        )
    exists = await db.scalar(select(Invoice).where(Invoice.order_id == order_id))
    if exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该订单已开具发票")
    if title_type == "company" and not tax_no:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="企业抬头需填写税号")
    inv = Invoice(
        invoice_no=_invoice_no(),
        order_id=order_id,
        buyer_id=buyer_id,
        title_type=InvoiceTitleType(title_type),
        title=title,
        tax_no=tax_no,
        amount=float(order.total_amount or 0) + float(order.freight or 0),
    )
    db.add(inv)
    await db.commit()
    await db.refresh(inv)
    out = InvoiceOut.model_validate(inv)
    out.order_no = order.order_no
    return out


async def my_invoices(db: AsyncSession, buyer_id: str) -> list[InvoiceOut]:
    rows = list(
        await db.scalars(
            select(Invoice).where(Invoice.buyer_id == buyer_id).order_by(Invoice.issued_at.desc())
        )
    )
    result = []
    for inv in rows:
        out = InvoiceOut.model_validate(inv)
        order = await db.get(Order, inv.order_id)
        out.order_no = order.order_no if order else None
        result.append(out)
    return result


async def order_invoice(db: AsyncSession, *, buyer_id: str, order_id: str) -> InvoiceOut | None:
    inv = await db.scalar(
        select(Invoice).where(Invoice.order_id == order_id, Invoice.buyer_id == buyer_id)
    )
    if not inv:
        return None
    out = InvoiceOut.model_validate(inv)
    order = await db.get(Order, order_id)
    out.order_no = order.order_no if order else None
    return out


async def build_pdf(db: AsyncSession, invoice_id: str) -> bytes:
    """生成电子发票 PDF 字节（真实票面：发票号/抬头/税号/金额/日期/商品明细）。

    reportlab 已列为项目依赖；此处延迟导入，缺依赖时抛出清晰错误而非影响其他功能。
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="发票不存在")
    order = await db.get(Order, inv.order_id)
    items: list[tuple[str, float, int]] = []
    if order:
        rows = await db.execute(
            select(OrderItem, Product)
            .join(Product, Product.id == OrderItem.product_id)
            .where(OrderItem.order_id == order.id)
        )
        for oi, prod in rows.all():
            items.append((prod.name if prod else "商品", float(oi.price), int(oi.quantity)))

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(20 * mm, 270 * mm, "电子发票（演示）")
    c.setFont("Helvetica", 11)
    y = 250 * mm
    c.drawString(20 * mm, y, f"发票号码：{inv.invoice_no}")
    y -= 8 * mm
    c.drawString(
        20 * mm,
        y,
        f"开票日期：{(inv.issued_at or datetime.now(timezone.utc)).strftime('%Y-%m-%d %H:%M')}",
    )
    y -= 8 * mm
    c.drawString(
        20 * mm,
        y,
        f"抬头类型：{'企业' if inv.title_type == InvoiceTitleType.COMPANY else '个人'}",
    )
    y -= 8 * mm
    c.drawString(20 * mm, y, f"抬头：{inv.title}")
    y -= 8 * mm
    if inv.tax_no:
        c.drawString(20 * mm, y, f"纳税人识别号：{inv.tax_no}")
        y -= 8 * mm
    if order:
        c.drawString(20 * mm, y, f"订单号：{order.order_no}")
        y -= 8 * mm
    c.drawString(20 * mm, y, f"价税合计：\u00a5{inv.amount:.2f}")
    y -= 12 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, y, "商品明细")
    y -= 7 * mm
    c.setFont("Helvetica", 10)
    for name, price, qty in items:
        c.drawString(20 * mm, y, f"- {name}  x{qty}  \u00a5{price:.2f}")
        y -= 6 * mm
    y -= 6 * mm
    c.setFont("Helvetica", 8)
    c.drawString(20 * mm, y, "本发票由演示系统生成，仅供功能展示，不具备法律效力。")
    c.showPage()
    c.save()
    return buf.getvalue()
