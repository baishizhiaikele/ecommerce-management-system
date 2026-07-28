"""电子发票业务：订单开票（演示级即时开具）。"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice, InvoiceTitleType
from app.models.order import Order, OrderStatus
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
