from datetime import datetime

from pydantic import BaseModel


class FollowShopOut(BaseModel):
    merchant_id: str
    shop_name: str | None = None
    shop_logo: str | None = None
    followers_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}
