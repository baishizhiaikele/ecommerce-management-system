from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ViewLogIn(BaseModel):
    product_id: str
    product_name: Optional[str] = None
    price: Optional[int] = None
    image_url: Optional[str] = None


class ViewLogOut(BaseModel):
    id: str
    product_id: str
    product_name: Optional[str] = None
    price: Optional[int] = None
    image_url: Optional[str] = None
    created_at: datetime


class BoughtOut(BaseModel):
    product_id: str
    product_name: str
    times: int
    image_url: Optional[str] = None
