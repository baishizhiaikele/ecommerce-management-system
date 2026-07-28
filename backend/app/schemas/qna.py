from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AnswerOut(BaseModel):
    id: str
    question_id: str
    user_id: str
    username: Optional[str] = None
    content: str
    is_accepted: bool = False
    created_at: datetime


class QuestionOut(BaseModel):
    id: str
    product_id: str
    user_id: str
    username: Optional[str] = None
    content: str
    created_at: datetime
    answers: list[AnswerOut] = []


class QuestionCreate(BaseModel):
    content: str = Field(min_length=1, max_length=500)


class AnswerCreate(BaseModel):
    content: str = Field(min_length=1, max_length=500)
