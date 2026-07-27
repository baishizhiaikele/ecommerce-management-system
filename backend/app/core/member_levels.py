"""会员等级体系配置与计算。

成长值（消费 / 任务积累）→ 等级 → 专属折扣与包邮权益。
等级为纯配置驱动，用户仅持久化 growth_value 与 level 两个字段，
由 member_service 根据阈值集中重算，避免分散维护。
"""
from __future__ import annotations

# 由低到高排列，min_growth 为该等级所需的最低成长值
MEMBER_TIERS: list[dict] = [
    {"key": "bronze", "name": "青铜会员", "min_growth": 0, "discount": 1.00, "free_shipping": False},
    {"key": "silver", "name": "白银会员", "min_growth": 1000, "discount": 0.98, "free_shipping": False},
    {"key": "gold", "name": "黄金会员", "min_growth": 5000, "discount": 0.95, "free_shipping": True},
    {"key": "diamond", "name": "钻石会员", "min_growth": 20000, "discount": 0.90, "free_shipping": True},
]

DEFAULT_TIER: dict = MEMBER_TIERS[0]


def get_tier(growth_value: int) -> dict:
    """返回给定成长值对应的等级定义。"""
    tier = DEFAULT_TIER
    for t in MEMBER_TIERS:
        if growth_value >= t["min_growth"]:
            tier = t
        else:
            break
    return tier


def get_next_tier(growth_value: int) -> dict | None:
    """返回下一等级定义；已是最高等级则返回 None。"""
    for t in MEMBER_TIERS:
        if growth_value < t["min_growth"]:
            return t
    return None
