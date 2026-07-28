from datetime import datetime

from pydantic import BaseModel, Field


class KnowledgeCreate(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    answer: str = Field(min_length=1, max_length=2000)


class KnowledgeOut(BaseModel):
    id: str
    merchant_id: str
    question: str
    answer: str
    source: str
    hit_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class SuggestOut(BaseModel):
    """买家提问时的知识库命中建议。"""
    entry_id: str
    question: str
    answer: str
    score: float
