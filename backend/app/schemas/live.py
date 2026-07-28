from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class LiveRoomCreate(BaseModel):
    title: str = Field(min_length=2, max_length=100)
    cover_url: str | None = None
    product_ids: list[str] = []


class LiveProductOut(BaseModel):
    id: str
    name: str
    price: float
    image_url: str | None = None
    stock: int = 0
    pinned: bool = False


class LiveRoomOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    merchant_id: str
    title: str
    cover_url: str | None
    status: str
    viewers: int
    started_at: datetime | None
    created_at: datetime | None
    # 冗余展示字段
    merchant_name: str | None = None
    product_count: int = 0


class LiveRoomDetail(LiveRoomOut):
    products: list[LiveProductOut] = []


class LiveMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=200)


class LiveMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    username: str
    content: str
    created_at: datetime | None
