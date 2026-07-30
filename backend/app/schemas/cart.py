from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class CartItemAdd(BaseModel):
    product_id: str
    quantity: int = Field(default=1, ge=1, le=99)
    variant_id: Optional[str] = None


class CartItemUpdate(BaseModel):
    quantity: int = Field(ge=1, le=99)


class CartItemOut(BaseModel):
    id: str
    product_id: str
    name: str
    price: Decimal
    image_url: Optional[str]
    stock: int
    quantity: int
    variant_id: Optional[str] = None
    variant_label: Optional[str] = None
    merchant_id: Optional[str] = None  # 商品所属商家，供前端做商家券/品类券适用范围判断
    category_id: Optional[str] = None  # 商品品类，供前端做品类券适用范围判断
    is_flash: bool = False  # 是否为限时秒杀成交价（用于前端显式标注）
    original: Optional[float] = None  # 限时秒杀时的商品原价，供前端以划线价展示
