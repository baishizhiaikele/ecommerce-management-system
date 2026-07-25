from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.user import Role


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=60)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    role: Role = Role.BUYER


class UserLogin(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    username: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime


class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[Role] = None
