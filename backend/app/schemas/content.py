from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.content import PromotionType


class BannerOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    title: str
    image_url: str
    link_type: str
    link_id: Optional[str] = None
    link_url: Optional[str] = None
    sort_order: int = 0


class PromotionOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    title: str
    type: PromotionType
    product_id: Optional[str] = None
    discount_price: Optional[Decimal] = None
    discount_rate: Optional[Decimal] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    is_active: bool = True
    threshold_amount: Optional[Decimal] = None
    gift_product_id: Optional[str] = None
    bundle_count: Optional[int] = None
    bundle_price: Optional[Decimal] = None
    # 前端展示用冗余字段（由接口填充）
    product_name: Optional[str] = None
    product_image: Optional[str] = None
    original_price: Optional[Decimal] = None
    gift_product_name: Optional[str] = None


class PromotionCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    type: PromotionType
    product_id: str
    discount_price: Optional[Decimal] = None
    discount_rate: Optional[float] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    is_active: bool = True
    threshold_amount: Optional[Decimal] = None
    gift_product_id: Optional[str] = None
    bundle_count: Optional[int] = None
    bundle_price: Optional[Decimal] = None


class AddressBase(BaseModel):
    receiver: str = Field(min_length=1, max_length=40)
    phone: str = Field(min_length=5, max_length=20)
    province: str = Field(min_length=1, max_length=40)
    city: str = Field(min_length=1, max_length=40)
    district: str = Field(min_length=1, max_length=40)
    detail: str = Field(min_length=1, max_length=200)
    is_default: bool = False


class AddressCreate(AddressBase):
    pass


class AddressUpdate(AddressBase):
    pass


class AddressOut(AddressBase):
    model_config = {"from_attributes": True}

    id: str
    user_id: str
