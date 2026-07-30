"""电子发票接口。"""
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.invoice import Invoice
from app.models.user import Role, User
from app.schemas.invoice import InvoiceApply, InvoiceOut
from app.services import invoice_service

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.post("/orders/{order_id}", response_model=InvoiceOut, status_code=201)
async def apply_invoice(
    order_id: str,
    body: InvoiceApply,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await invoice_service.apply_invoice(
        db,
        buyer_id=user.id,
        order_id=order_id,
        title_type=body.title_type,
        title=body.title,
        tax_no=body.tax_no,
    )


@router.get("/orders/{order_id}", response_model=InvoiceOut | None)
async def order_invoice(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await invoice_service.order_invoice(db, buyer_id=user.id, order_id=order_id)


@router.get("/mine", response_model=list[InvoiceOut])
async def my_invoices(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return await invoice_service.my_invoices(db, user.id)


@router.get("/{invoice_id}/pdf")
async def download_invoice_pdf(
    invoice_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from fastapi.responses import Response

    # P0-H3：校验发票归属，禁止越权下载他人电子发票（含税号等敏感信息）
    inv = await db.get(Invoice, invoice_id)
    if not inv or (inv.buyer_id != user.id and user.role != Role.ADMIN):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="发票不存在")
    data = await invoice_service.build_pdf(db, invoice_id)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="invoice_{invoice_id}.pdf"'},
    )
