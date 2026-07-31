from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, field_serializer, field_validator, model_validator

from app.models.coupon import CouponType
from app.utils.time import iso_utc


def _validate_coupon_value(type_: CouponType | None, value: Decimal | None) -> None:
    """折扣券 value 必须在 (0,1)；满减券 value 必须 > 0，防止负抵扣/加价。"""
    if value is None:
        return
    if value <= 0:
        raise ValueError("优惠券面额/折扣必须大于 0")
    if type_ == CouponType.DISCOUNT and value >= 1:
        raise ValueError("折扣券折扣系数必须小于 1（如 0.8 表示 8 折）")


class CouponOut(BaseModel):
    id: str
    name: str
    type: CouponType
    threshold: Decimal
    value: Decimal
    expire_at: Optional[datetime] = None
    is_active: bool
    merchant_id: Optional[str] = None
    applicable_category: Optional[str] = None  # 适用顶级品类 slug；空=全品类可用
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    total: int = 0
    issued: int = 0

    @field_serializer("expire_at", "start_at", "end_at")
    def _ser_dt(self, v: Optional[datetime]) -> Optional[str]:
        return iso_utc(v)


class CouponCreate(BaseModel):
    name: str
    type: CouponType
    threshold: Decimal = Decimal(0)
    value: Decimal
    total: int = 0
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    # 消费券到期时间（用户领取后在该时间前可用）。留空则同步为 end_at。
    expire_at: Optional[datetime] = None
    # 仅管理员可指定归属商家；商家创建时始终为本人
    merchant_id: Optional[str] = None
    applicable_category: Optional[str] = None  # 适用顶级品类 slug；空=全品类可用

    @field_validator("threshold")
    @classmethod
    def _threshold_non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("满减门槛不能为负数")
        return v

    @field_validator("total")
    @classmethod
    def _total_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("发行量不能为负数")
        return v

    @model_validator(mode="after")
    def _check_value(self) -> "CouponCreate":
        _validate_coupon_value(self.type, self.value)
        if self.start_at and self.end_at and self.end_at <= self.start_at:
            raise ValueError("结束时间必须晚于开始时间")
        return self


class CouponUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[CouponType] = None
    threshold: Optional[Decimal] = None
    value: Optional[Decimal] = None
    total: Optional[int] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    expire_at: Optional[datetime] = None
    is_active: Optional[bool] = None
    applicable_category: Optional[str] = None  # 适用顶级品类 slug；空=全品类可用

    @field_validator("threshold")
    @classmethod
    def _threshold_non_negative(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v < 0:
            raise ValueError("满减门槛不能为负数")
        return v

    @model_validator(mode="after")
    def _check_value(self) -> "CouponUpdate":
        _validate_coupon_value(self.type, self.value)
        return self


class UserCouponOut(BaseModel):
    id: str
    coupon_id: str
    name: str
    type: CouponType
    threshold: Decimal
    value: Decimal
    expire_at: Optional[datetime] = None
    is_used: bool
    claimed_at: datetime
    merchant_id: Optional[str] = None  # 从关联 coupon 取，供前端做商家券适用范围判断
    applicable_category: Optional[str] = None  # 适用顶级品类 slug，空=全品类可用

    @field_serializer("expire_at", "claimed_at")
    def _ser_user_dt(self, v: Optional[datetime]) -> Optional[str]:
        return iso_utc(v)
