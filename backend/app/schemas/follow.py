from datetime import datetime

from pydantic import BaseModel


class FollowShopOut(BaseModel):
    merchant_id: str
    shop_name: str | None = None
    shop_logo: str | None = None
    followers_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class ShopEventOut(BaseModel):
    id: str
    merchant_id: str
    shop_name: str | None = None
    product_id: str | None = None
    event_type: str
    product_name: str | None = None
    image_url: str | None = None
    old_price: float | None = None
    new_price: float | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
