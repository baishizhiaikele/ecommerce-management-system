from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from app.models.product import ProductStatus


class CategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    slug: str = Field(min_length=1, max_length=80)
    parent_id: Optional[str] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryOut(CategoryBase):
    model_config = {"from_attributes": True}

    id: str
    created_at: datetime


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: Optional[str] = None
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    stock: int = Field(ge=0, le=1_000_000)
    image_url: Optional[str] = Field(default=None, max_length=512)
    category_id: Optional[str] = None
    warning_threshold: Optional[int] = Field(default=None, ge=0, le=100000)
    ar_enabled: Optional[bool] = None
    ar_overlay_url: Optional[str] = Field(default=None, max_length=512)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    description: Optional[str] = None
    price: Optional[Decimal] = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    stock: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    image_url: Optional[str] = Field(default=None, max_length=512)
    category_id: Optional[str] = None
    warning_threshold: Optional[int] = Field(default=None, ge=0, le=100000)
    ar_enabled: Optional[bool] = None
    ar_overlay_url: Optional[str] = Field(default=None, max_length=512)


class ProductOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    merchant_id: str
    category_id: Optional[str]
    name: str
    description: Optional[str]
    price: Decimal
    stock: int
    image_url: Optional[str]
    images: Optional[str] = None
    specs: Optional[str] = None
    status: ProductStatus
    sales_count: int = 0
    warning_threshold: int = 10
    ai_title: Optional[str]
    ai_copy: Optional[str]
    ai_price_suggestion: Optional[Decimal]
    created_at: datetime
    reject_reason: Optional[str] = None
    ar_enabled: bool = False
    ar_overlay_url: Optional[str] = None


class AIGenerateRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)


class AIGenerateResult(BaseModel):
    title: str
    sales_copy: str
    price_suggestion: float


class MarketingRequest(BaseModel):
    platform: str = "小红书"  # 小红书 | 朋友圈 | 抖音
    note: Optional[str] = Field(default=None, max_length=500)


class MarketingResult(BaseModel):
    platform: str
    content: str


class PriceAdviceRequest(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)
    market_price: Optional[float] = None


class PriceAdviceResult(BaseModel):
    suggested_price: float
    reason: str


class ProductStatusUpdate(BaseModel):
    status: ProductStatus
    reject_reason: Optional[str] = Field(default=None, max_length=300)
