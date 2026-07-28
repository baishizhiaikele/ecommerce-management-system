"""预售定金接口。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.presale import BalancePay, PresaleCreate, PresaleOut, ReservationOut
from app.services import presale_service

router = APIRouter(prefix="/presales", tags=["presales"])


@router.get("", response_model=list[PresaleOut])
async def list_presales(db: AsyncSession = Depends(get_db)):
    return await presale_service.list_presales(db)


@router.post("", response_model=PresaleOut, status_code=201)
async def create_presale(
    body: PresaleCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
):
    return await presale_service.create_presale(
        db,
        merchant=user,
        product_id=body.product_id,
        title=body.title,
        presale_price=body.presale_price,
        deposit=body.deposit,
        inflate_rate=body.inflate_rate,
        end_at=body.end_at,
    )


@router.get("/mine", response_model=list[PresaleOut])
async def my_presales(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
):
    return await presale_service.list_presales(db, merchant_id=user.id)


@router.get("/reservations", response_model=list[ReservationOut])
async def my_reservations(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return await presale_service.my_reservations(db, user.id)


@router.post("/{presale_id}/deposit", response_model=ReservationOut, status_code=201)
async def pay_deposit(
    presale_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await presale_service.pay_deposit(db, user=user, presale_id=presale_id)


@router.post("/reservations/{reservation_id}/balance", response_model=ReservationOut)
async def pay_balance(
    reservation_id: str,
    body: BalancePay,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await presale_service.pay_balance(
        db, user=user, reservation_id=reservation_id, address=body.address
    )
