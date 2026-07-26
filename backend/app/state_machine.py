from app.models.order import OrderStatus
from app.models.user import Role

# 集中式订单状态流转矩阵：每个状态允许流转到 (目标状态, 允许触发的角色)
ALLOWED_TRANSITIONS: dict[OrderStatus, list[tuple[OrderStatus, list[Role]]]] = {
    OrderStatus.PENDING_PAYMENT: [
        (OrderStatus.PAID, [Role.BUYER]),
        (OrderStatus.CANCELLED, [Role.BUYER, Role.ADMIN]),
    ],
    OrderStatus.PAID: [
        (OrderStatus.SHIPPED, [Role.MERCHANT]),
        (OrderStatus.REFUND_REQUESTED, [Role.BUYER]),
    ],
    OrderStatus.SHIPPED: [
        (OrderStatus.COMPLETED, [Role.BUYER]),
        (OrderStatus.REFUND_REQUESTED, [Role.BUYER]),
    ],
    OrderStatus.REFUND_REQUESTED: [
        (OrderStatus.REFUNDED, [Role.MERCHANT, Role.ADMIN]),
        (OrderStatus.REFUND_REJECTED, [Role.MERCHANT, Role.ADMIN]),
    ],
    OrderStatus.REFUND_REJECTED: [
        (OrderStatus.REFUND_REQUESTED, [Role.BUYER]),
        (OrderStatus.COMPLETED, [Role.BUYER]),
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
