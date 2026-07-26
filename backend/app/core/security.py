import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Response
from jwt.exceptions import InvalidTokenError

from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _encode(payload: dict) -> str:
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_access_token(sub: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return _encode({"sub": str(sub), "role": role, "type": "access", "exp": expire})


def create_refresh_token(sub: str, version: int = 1) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    # jti 保证每次签发的刷新令牌唯一，实现轮换（旧令牌作废）
    return _encode(
        {
            "sub": str(sub),
            "type": "refresh",
            "v": version,
            "jti": str(uuid.uuid4()),
            "exp": expire,
        }
    )


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])


def is_token_type(token: str, expected: str) -> bool:
    try:
        payload = decode_token(token)
        return payload.get("type") == expected
    except InvalidTokenError:
        return False


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """将令牌写入 HttpOnly Cookie（S4）：降低 XSS 直接盗用风险。"""
    secure = bool(settings.FRONTEND_ORIGINS and settings.FRONTEND_ORIGINS[0].startswith("https"))
    common = {"httponly": True, "samesite": "lax", "secure": secure, "path": "/"}
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **common,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        **common,
    )


def clear_auth_cookies(response: Response) -> None:
    for key in ("access_token", "refresh_token"):
        response.delete_cookie(key, path="/")
