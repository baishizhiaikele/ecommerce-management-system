"""退款自动审核：小额、低风险的"仅退款"申请免人工秒退。

规则（对齐主流平台风控实践的演示版）：
1. 仅针对未发货"仅退款"（REFUND_REQUESTED）；退货退款仍需商家验货。
2. 退款金额 ≤ AUTO_REFUND_MAX_AMOUNT。
3. 买家近 RECENT_DAYS 天内退款成功次数 < MAX_RECENT_REFUNDS（防薅羊毛）。
命中即自动流转 REFUNDED（复用状态机：回补库存、逆向资金、回收积分、冲正佣金）。
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationType
from app.models.order import Order, OrderStatus
from app.services.notification_service import notify

AUTO_REFUND_MAX_AMOUNT = 100.0
RECENT_DAYS = 30
MAX_RECENT_REFUNDS = 3


async def try_auto_refund(db: AsyncSession, order: Order) -> bool:
    """尝试自动通过退款；返回是否命中自动审核。"""
    if order.status != OrderStatus.REFUND_REQUESTED:
        return False
    amount = float(order.refund_amount or order.total_amount or 0)
    if amount > AUTO_REFUND_MAX_AMOUNT:
        return False
    since = datetime.now(timezone.utc) - timedelta(days=RECENT_DAYS)
    recent = int(
        await db.scalar(
            select(func.count(Order.id)).where(
                Order.buyer_id == order.buyer_id,
                Order.status == OrderStatus.REFUNDED,
                Order.created_at >= since,
            )
        )
        or 0
    )
    if recent >= MAX_RECENT_REFUNDS:
        return False

    from app.services.audit_service import record
    from app.services.order_service import transition_status

    order = await transition_status(
        db, order=order, target=OrderStatus.REFUNDED, actor_id=order.buyer_id, role="admin"
    )
    await record(
        db,
        order.buyer_id,
        "auto_refund",
        "order",
        order.id,
        f"小额退款 ¥{amount:.2f} 自动审核通过（免人工）",
    )
    await notify(
        db,
        order.buyer_id,
        NotificationType.ORDER,
        "退款已自动通过",
        f"订单 {order.order_no} 的退款 ¥{amount:.2f} 已由系统自动审核通过，款项将原路退回。",
        order.id,
    )
    await db.commit()
    return True
