"""子账号（商家员工）权限模型。

商家可创建多个子账号，每个子账号对应一个 role=MERCHANT 的登录用户，
通过 `permissions` 字段（逗号分隔的权限键）限制其可操作的模块。
子账号登录后，业务接口依据其归属的商家（owner）来校验数据权限。
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base

# 可授权的模块键
STAFF_PERMISSIONS = [
    "products",
    "orders",
    "reviews",
    "promotions",
    "presales",
    "live",
    "invoices",
    "analytics",
]

PERMISSION_LABELS = {
    "products": "商品管理",
    "orders": "订单管理",
    "reviews": "评价管理",
    "promotions": "促销活动",
    "presales": "预售管理",
    "live": "直播带货",
    "invoices": "发票管理",
    "analytics": "数据分析",
}


class SubAccount(Base):
    __tablename__ = "sub_accounts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    staff_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, unique=True)
    permissions = Column(Text, default="")  # 逗号分隔的权限键
    is_active = Column(Boolean, default=True, nullable=False, server_default="1")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", foreign_keys=[owner_id])
    staff = relationship("User", foreign_keys=[staff_user_id])
