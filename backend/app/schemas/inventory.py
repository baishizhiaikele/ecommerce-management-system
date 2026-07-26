from datetime import datetime

from pydantic import BaseModel

from app.models.inventory import StockChangeType


class StockAdjustIn(BaseModel):
    product_id: str
    quantity: int  # 正数入库，负数出库
    change_type: StockChangeType = StockChangeType.MANUAL
    remark: str | None = None


class StockLogOut(BaseModel):
    id: str
    product_id: str
    product_name: str | None = None
    change_type: StockChangeType
    quantity: int
    balance_after: int
    remark: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class StockSummaryOut(BaseModel):
    total_skus: int
    low_stock_count: int
    out_of_stock_count: int
    recent_changes: int
