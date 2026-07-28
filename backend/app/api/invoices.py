"""电子发票接口。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
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
