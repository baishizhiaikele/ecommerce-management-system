from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.order import Order
from app.models.user import Role, User
from app.core.config import settings
from app.services import payment_service
from app.services.order_service import get_order

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/orders/{order_id}/pay")
async def create_pay(
    order_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """买家发起支付：生成支付单与跳转参数（sandbox 自测网关）。"""
    order = await get_order(db, order_id, user_id=user.id, role="buyer")
    if order.status.value != "pending_payment":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="订单不在待支付状态"
        )
    return await payment_service.create_charge(db, order)


@router.get("/orders/{order_id}/status")
async def pay_status(
    order_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """查询订单支付与担保状态（托管/已释放/已逆向）。"""
    order = await get_order(db, order_id, user_id=user.id, role="buyer")
    return await payment_service.get_payment_status(db, order)


@router.post("/orders/{order_id}/confirm")
async def confirm_pay(
    order_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """沙箱自测：买家确认支付（生产应仅由网关 webhook 触发）。"""
    # P0-M1：仅沙箱环境允许自助确认，生产由支付网关 webhook 触发，避免支付绕过
    if settings.PAYMENT_GATEWAY != "sandbox":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="当前环境不支持自助确认支付"
        )
    order = await get_order(db, order_id, user_id=user.id, role="buyer")
    if order.status.value != "pending_payment":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="订单不在待支付状态"
        )
    payment = await payment_service.confirm_payment(db, order)
    return payment


@router.post("/webhook/{gateway}")
async def webhook(gateway: str, payload: dict, db: AsyncSession = Depends(get_db)) -> dict:
    """支付网关异步回调（公开接口，靠签名验真 + 幂等保证安全）。"""
    try:
        return await payment_service.handle_webhook(db, gateway, payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/settlements", tags=["payments"])
async def list_settlements(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    only: str | None = None,
) -> list[dict]:
    """商家/管理员查看担保结算台账：held（托管中）/ settled（已释放）/ reversed（已退款）。"""
    if user.role not in (Role.ADMIN, Role.MERCHANT):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权限")
    from sqlalchemy import select

    from app.models.settlement import Settlement

    stmt = select(Settlement)
    if user.role == Role.MERCHANT:
        stmt = stmt.where(Settlement.merchant_id == user.id)
    if only:
        stmt = stmt.where(Settlement.status == only)
    rows = (await db.scalars(stmt)).all()
    return [
        {
            "id": s.id,
            "order_id": s.order_id,
            "merchant_id": s.merchant_id,
            "amount": float(s.amount),
            "currency": s.currency,
            "status": s.status,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "settled_at": s.settled_at.isoformat() if s.settled_at else None,
        }
        for s in rows
    ]
