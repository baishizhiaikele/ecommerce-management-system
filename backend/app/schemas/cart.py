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
