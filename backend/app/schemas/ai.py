"""AI 相关响应模型：首页编排、选品/趋势洞察。"""

from typing import Any

from pydantic import BaseModel

from app.schemas.product import ProductOut


class FloorOut(BaseModel):
    """首页楼层编排单元（含该楼层的真实商品内容）。"""

    key: str
    title: str
    reason: str
    products: list[ProductOut] = []


class HomeArrangeOut(BaseModel):
    """AI 首页编排结果：按身份/时段排序的楼层 + 一句话洞察。"""

    segment: str
    hour: int
    floors: list[FloorOut]
    insight: str
    # AI-2 A/B 实验：用户落入的桶（0=对照组-规则编排，1=实验组-LLM 决策），group 为可读标签
    bucket: int = 0
    group: str = "control"


class TrendInsightOut(BaseModel):
    """AI 选品/趋势洞察结果。"""

    hot_keywords: list[str]
    demand_gap: list[dict[str, Any]]
    suggested_categories: list[dict[str, Any]]
    rising_products: list[dict[str, Any]]
    insight: str
