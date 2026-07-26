from pydantic import BaseModel


class VariantCreate(BaseModel):
    sku_code: str | None = None
    specs: dict = {}
    price_delta: float = 0.0
    stock: int = 0
    image_url: str | None = None


class VariantUpdate(BaseModel):
    sku_code: str | None = None
    specs: dict | None = None
    price_delta: float | None = None
    stock: int | None = None
    image_url: str | None = None


class VariantOut(BaseModel):
    id: str
    product_id: str
    sku_code: str | None = None
    specs: dict = {}
    price_delta: float = 0.0
    stock: int = 0
    image_url: str | None = None
