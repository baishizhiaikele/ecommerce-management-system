"""预售定金业务：商家开预售 → 买家付定金（膨胀抵扣）→ 付尾款转正式订单。"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationType
from app.models.order import Order, OrderItem, OrderStatus
from app.models.presale import Presale, PresaleReservation, ReservationStatus
from app.models.product import Product, ProductStatus
from app.models.user import User
from app.schemas.presale import PresaleOut, ReservationOut
from app.services.notification_service import notify


def _order_no() -> str:
    return f"NO{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:4].upper()}"


def _deduction(p: Presale) -> float:
    """定金可抵扣金额（定金 × 膨胀系数，上限为预售价）。"""
    return round(min(float(p.deposit) * float(p.inflate_rate), float(p.presale_price)), 2)


def _balance(p: Presale) -> float:
    return round(max(float(p.presale_price) - _deduction(p), 0.0), 2)


def _expired(p: Presale) -> bool:
    if not p.end_at:
        return False
    end = p.end_at if p.end_at.tzinfo else p.end_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > end


async def _presale_out(db: AsyncSession, p: Presale) -> PresaleOut:
    out = PresaleOut.model_validate(p)
    product = await db.get(Product, p.product_id)
    if product:
        out.product_name = product.name
        out.product_image = product.image_url
        out.original_price = product.price
    out.deposit_deduction = _deduction(p)
    out.balance_due = _balance(p)
    return out


async def create_presale(
    db: AsyncSession,
    *,
    merchant: User,
    product_id: str,
    title: str,
    presale_price,
    deposit,
    inflate_rate: float,
    end_at,
) -> PresaleOut:
    product = await db.get(Product, product_id)
    if not product or product.merchant_id != merchant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在或不属于你")
    if float(deposit) * inflate_rate >= float(presale_price):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="定金抵扣额不能超过预售价"
        )
    row = Presale(
        merchant_id=merchant.id,
        product_id=product_id,
        title=title,
        presale_price=presale_price,
        deposit=deposit,
        inflate_rate=inflate_rate,
        end_at=end_at,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await _presale_out(db, row)


async def list_presales(db: AsyncSession, *, merchant_id: str | None = None) -> list[PresaleOut]:
    stmt = select(Presale).order_by(Presale.created_at.desc())
    if merchant_id:
        stmt = stmt.where(Presale.merchant_id == merchant_id)
    else:
        stmt = stmt.where(Presale.is_active == 1)
    rows = list(await db.scalars(stmt))
    if not merchant_id:
        rows = [p for p in rows if not _expired(p)]
    return [await _presale_out(db, p) for p in rows]


async def pay_deposit(db: AsyncSession, *, user: User, presale_id: str) -> ReservationOut:
    presale = await db.get(Presale, presale_id)
    if not presale or not presale.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="预售活动不存在")
    if _expired(presale):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="预售已结束")
    exists = await db.scalar(
        select(PresaleReservation).where(
            PresaleReservation.presale_id == presale_id,
            PresaleReservation.user_id == user.id,
            PresaleReservation.status == ReservationStatus.DEPOSIT_PAID,
        )
    )
    if exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="你已支付过定金")
    row = PresaleReservation(
        presale_id=presale_id, user_id=user.id, deposit_paid=presale.deposit
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await _reservation_out(db, row)


async def _reservation_out(db: AsyncSession, r: PresaleReservation) -> ReservationOut:
    out = ReservationOut.model_validate(r)
    presale = await db.get(Presale, r.presale_id)
    if presale:
        out.presale_title = presale.title
        out.balance_due = _balance(presale)
        product = await db.get(Product, presale.product_id)
        if product:
            out.product_name = product.name
            out.product_image = product.image_url
    return out


async def my_reservations(db: AsyncSession, user_id: str) -> list[ReservationOut]:
    rows = list(
        await db.scalars(
            select(PresaleReservation)
            .where(PresaleReservation.user_id == user_id)
            .order_by(PresaleReservation.created_at.desc())
        )
    )
    return [await _reservation_out(db, r) for r in rows]


async def pay_balance(
    db: AsyncSession, *, user: User, reservation_id: str, address: str
) -> ReservationOut:
    """支付尾款：生成已支付的正式订单并扣减库存。"""
    r = await db.get(PresaleReservation, reservation_id)
    if not r or r.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="预约不存在")
    if r.status != ReservationStatus.DEPOSIT_PAID:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="该预约不可支付尾款")
    presale = await db.get(Presale, r.presale_id)
    product = await db.get(Product, presale.product_id)
    if not product or product.status != ProductStatus.ACTIVE or (product.stock or 0) < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="商品缺货，无法交付")

    deduction = _deduction(presale)
    balance = _balance(presale)
    # 买家实付 = 定金 + 尾款；订单总额按实付记，膨胀部分记入优惠
    paid_total = round(float(presale.deposit) + balance, 2)
    now = datetime.now(timezone.utc)
    order = Order(
        order_no=_order_no(),
        buyer_id=user.id,
        status=OrderStatus.PAID,
        total_amount=paid_total,
        discount_amount=round(deduction - float(presale.deposit), 2),
        freight=0,
        address=address,
        paid_at=now,
    )
    db.add(order)
    await db.flush()
    db.add(
        OrderItem(
            order_id=order.id,
            product_id=product.id,
            quantity=1,
            price=float(presale.presale_price),
        )
    )
    product.stock = max((product.stock or 0) - 1, 0)
    product.sales_count = (product.sales_count or 0) + 1

    r.status = ReservationStatus.COMPLETED
    r.order_id = order.id
    r.completed_at = now
    await notify(
        db,
        presale.merchant_id,
        NotificationType.ORDER,
        "预售尾款已支付",
        f"预售「{presale.title}」买家已付尾款，订单 {order.order_no} 待发货。",
        order.id,
    )
    await db.commit()
    await db.refresh(r)
    return await _reservation_out(db, r)
