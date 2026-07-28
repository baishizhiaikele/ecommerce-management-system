from app.models.order import OrderStatus
from app.models.user import Role

# 集中式订单状态流转矩阵：每个状态允许流转到 (目标状态, 允许触发的角色)
# 设计要点（2026 合规）：已发货/已收货订单必须先"退货"并"商家确认收货"(RETURN_RECEIVED)
# 才能打款(REFUNDED)，杜绝"仅退款"——即退款以实物退回为前提。
ALLOWED_TRANSITIONS: dict[OrderStatus, list[tuple[OrderStatus, list[Role]]]] = {
    OrderStatus.PENDING_PAYMENT: [
        (OrderStatus.PAID, [Role.BUYER]),
        (OrderStatus.CANCELLED, [Role.BUYER, Role.ADMIN]),
    ],
    OrderStatus.PAID: [
        (OrderStatus.SHIPPED, [Role.MERCHANT]),
        # 未发货：平台直接仅退款
        (OrderStatus.REFUND_REQUESTED, [Role.BUYER]),
    ],
    OrderStatus.SHIPPED: [
        (OrderStatus.COMPLETED, [Role.BUYER]),
        # 已发货：申请退货（非仅退款）
        (OrderStatus.RETURN_REQUESTED, [Role.BUYER]),
    ],
    OrderStatus.COMPLETED: [
        # 收货后售后（7 天无理由等）
        (OrderStatus.RETURN_REQUESTED, [Role.BUYER]),
    ],
    # 仅退款（未发货）
    OrderStatus.REFUND_REQUESTED: [
        (OrderStatus.REFUNDED, [Role.MERCHANT, Role.ADMIN]),
        (OrderStatus.REFUND_REJECTED, [Role.MERCHANT, Role.ADMIN]),
    ],
    OrderStatus.REFUND_REJECTED: [
        (OrderStatus.REFUND_REQUESTED, [Role.BUYER]),
        (OrderStatus.DISPUTE, [Role.BUYER, Role.ADMIN]),
    ],
    # 退货退款链路
    OrderStatus.RETURN_REQUESTED: [
        (OrderStatus.RETURN_SHIPPED, [Role.BUYER]),  # 买家寄回
        (OrderStatus.REFUND_REJECTED, [Role.MERCHANT, Role.ADMIN]),
        (OrderStatus.DISPUTE, [Role.BUYER, Role.ADMIN]),
    ],
    OrderStatus.RETURN_SHIPPED: [
        (OrderStatus.RETURN_RECEIVED, [Role.MERCHANT, Role.ADMIN]),  # 商家确认收货
        (OrderStatus.DISPUTE, [Role.BUYER, Role.ADMIN]),
    ],
    OrderStatus.RETURN_RECEIVED: [
        (OrderStatus.REFUNDED, [Role.MERCHANT, Role.ADMIN]),  # 确认收货后打款
        (OrderStatus.EXCHANGE, [Role.MERCHANT, Role.ADMIN]),  # 换货
        (OrderStatus.DISPUTE, [Role.BUYER, Role.ADMIN]),
    ],
    OrderStatus.EXCHANGE: [
        (OrderStatus.COMPLETED, [Role.BUYER]),  # 买家收到换货
    ],
    # 平台仲裁（最终出口）
    OrderStatus.DISPUTE: [
        (OrderStatus.REFUNDED, [Role.ADMIN]),
        (OrderStatus.COMPLETED, [Role.ADMIN]),
    ],
}


def can_transition(current: OrderStatus, target: OrderStatus, role: Role) -> bool:
    if current == target:
        return False
    for allowed_target, allowed_roles in ALLOWED_TRANSITIONS.get(current, []):
        if allowed_target == target and role in allowed_roles:
            return True
    return False


def next_allowed(current: OrderStatus, role: Role) -> list[OrderStatus]:
    return [
        target
        for target, roles in ALLOWED_TRANSITIONS.get(current, [])
        if role in roles
    ]
