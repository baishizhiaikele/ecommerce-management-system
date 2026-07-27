from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel


class MerchantStats(BaseModel):
    product_count: int
    active_product_count: int
    order_count: int
    paid_order_count: int
    total_sales: Decimal
    pending_review_count: int
    low_stock_count: int


class AdminStats(BaseModel):
    user_count: int
    merchant_count: int
    product_count: int
    pending_product_count: int
    order_count: int
    total_gmv: Decimal
    negative_review_count: int


class TrendPoint(BaseModel):
    date: str
    amount: Decimal
    orders: int = 0


# ---------- 仪表板深度分析（科技渐变看板）----------


class CategoryBreakdown(BaseModel):
    category_id: Optional[str] = None
    category: str
    products: int
    sales: int
    revenue: float


class TopProduct(BaseModel):
    id: str
    name: str
    sales: int
    revenue: float


class FunnelStage(BaseModel):
    stage: str
    value: int


class Comparison(BaseModel):
    gmv_now: float
    gmv_prev: float
    gmv_rate: float
    orders_now: int
    orders_prev: int
    orders_rate: float


class RFMSegment(BaseModel):
    segment: str
    customers: int
    total_monetary: float


class DashboardAnalytics(BaseModel):
    category_breakdown: List[CategoryBreakdown]
    top_products: List[TopProduct]
    funnel: List[FunnelStage]
    comparison: Comparison
    rfm: List[RFMSegment] = []
    repurchase_rate: float = 0.0
    buyers: int = 0


class MerchantAnalytics(BaseModel):
    stats: MerchantStats
    rfm: List[RFMSegment] = []
    repurchase_rate: float = 0.0
    buyers: int = 0
    sales_trend: List[TrendPoint] = []
    top_products: List[TopProduct] = []
