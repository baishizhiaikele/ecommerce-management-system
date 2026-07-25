from collections import defaultdict
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api._product_snapshot import load_product_map, snapshot_name
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.order import Order, OrderItem
from app.models.user import User
from app.schemas.order import CheckoutRequest, OrderItemOut, OrderOut, OrderStatusUpdate
from app.services import order_service

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
    order = await order_service.checkout(db, buyer_id=user.id, address=data.address)
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
