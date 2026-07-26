from collections import defaultdict
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api._product_snapshot import load_product_map, snapshot_name
from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.user import Role, User
from app.schemas.order import (
    CheckoutRequest,
    LogisticsEvent,
    LogisticsUpdate,
    OrderItemOut,
    OrderOut,
    OrderStatusUpdate,
    RefundRequest,
    RefundReview,
)
from app.services import order_service
from app.services.audit_service import record

router = APIRouter(prefix="/orders", tags=["orders"])


def _serialize(order: Order, items: list, snapshot: dict) -> OrderOut:
    item_outs = [
        OrderItemOut(
            id=it.id,
            product_id=it.product_id,
            name=snapshot_name(snapshot, it.product_id),
            price=it.price,
            quantity=it.quantity,
        )
        for it in items
    ]
    return OrderOut(
        id=order.id,
        order_no=order.order_no,
        status=order.status,
        total_amount=order.total_amount,
        discount_amount=order.discount_amount,
        address=order.address,
        items=item_outs,
        created_at=order.created_at,
        paid_at=order.paid_at,
        shipped_at=order.shipped_at,
        completed_at=order.completed_at,
    )


async def _load_order_view(db: AsyncSession, order: Order) -> OrderOut:
    """加载单个订单的明细并批量装配商品快照。"""
    items = list(await db.scalars(select(OrderItem).where(OrderItem.order_id == order.id)))
    snapshot = await load_product_map(db, [it.product_id for it in items])
    return _serialize(order, items, snapshot)


@router.post("/checkout", response_model=OrderOut, status_code=201)
async def checkout(
    data: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrderOut:
    order = await order_service.checkout(
        db,
        buyer=user,
        address=data.address,
        coupon_id=data.coupon_id,
        use_points=data.use_points,
    )
    return await _load_order_view(db, order)


@router.get("", response_model=list[OrderOut])
async def list_orders(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list[OrderOut]:
    orders = await order_service.list_orders(db, user_id=user.id, role=user.role.value)
    items_by_order: dict = defaultdict(list)
    product_ids: list = []
    if orders:
        all_items = list(
            await db.scalars(
                select(OrderItem).where(OrderItem.order_id.in_([o.id for o in orders]))
            )
        )
        for it in all_items:
            items_by_order[it.order_id].append(it)
            product_ids.append(it.product_id)
    snapshot = await load_product_map(db, product_ids)
    return [_serialize(o, items_by_order.get(o.id, []), snapshot) for o in orders]


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> OrderOut:
    order = await order_service.get_order(db, order_id, user_id=user.id, role=user.role.value)
    return await _load_order_view(db, order)


@router.patch("/{order_id}/status", response_model=OrderOut)
async def transition(
    order_id: str,
    data: OrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrderOut:
    order = await order_service.get_order(db, order_id, user_id=user.id, role=user.role.value)
    order = await order_service.transition_status(
        db, order=order, target=data.status, actor_id=user.id, role=user.role.value
    )
    return await _load_order_view(db, order)


# ---------------- 售后退款 ----------------

async def _merchant_owns_order(db: AsyncSession, order: Order, merchant_id: str) -> bool:
    # P1：一次关联查询代替逐 OrderItem 查 Product 的 N+1
    count = await db.scalar(
        select(func.count(OrderItem.id))
        .join(Product, Product.id == OrderItem.product_id)
        .where(OrderItem.order_id == order.id, Product.merchant_id == merchant_id)
    )
    return bool(count)


@router.post("/{order_id}/refund", response_model=OrderOut)
async def request_refund(
    order_id: str,
    data: RefundRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrderOut:
    if user.role != Role.BUYER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅买家可申请退款")
    order = await order_service.get_order(db, order_id, user_id=user.id, role=user.role.value)
    if order.status not in (OrderStatus.PAID, OrderStatus.SHIPPED):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="当前订单状态不可申请退款")
    order.refund_reason = data.reason
    order = await order_service.transition_status(
        db, order=order, target=OrderStatus.REFUND_REQUESTED, actor_id=user.id, role="buyer"
    )
    return await _load_order_view(db, order)


@router.patch("/{order_id}/refund-review", response_model=OrderOut)
async def review_refund(
    order_id: str,
    data: RefundReview,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT, Role.ADMIN)),
) -> OrderOut:
    order = await order_service.get_order(db, order_id, user_id=user.id, role=user.role.value)
    if user.role == Role.MERCHANT and not await _merchant_owns_order(db, order, user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权处理该订单")
    target = OrderStatus.REFUNDED if data.approve else OrderStatus.REFUND_REJECTED
    order = await order_service.transition_status(
        db, order=order, target=target, actor_id=user.id, role=user.role.value
    )
    await record(db, user.id, f"order.refund_review.{target.value}", "order", order.id, data.note)
    await db.commit()
    return await _load_order_view(db, order)


# ---------------- 物流追踪 ----------------

@router.post("/{order_id}/logistics", response_model=dict)
async def add_logistics(
    order_id: str,
    data: LogisticsUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT, Role.ADMIN)),
) -> dict:
    order = await order_service.get_order(db, order_id, user_id=user.id, role=user.role.value)
    if user.role == Role.MERCHANT and not await _merchant_owns_order(db, order, user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权操作该订单")
    if data.tracking_no:
        order.tracking_no = data.tracking_no
    trace = json.loads(order.logistics or "[]")
    trace.append(data.event.model_dump())
    order.logistics = json.dumps(trace, ensure_ascii=False)
    await db.commit()
    return {"tracking_no": order.tracking_no, "events": trace}


@router.get("/{order_id}/logistics", response_model=dict)
async def get_logistics(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    order = await order_service.get_order(db, order_id, user_id=user.id, role=user.role.value)
    return {"tracking_no": order.tracking_no, "events": json.loads(order.logistics or "[]")}
