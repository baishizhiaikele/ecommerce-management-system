import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


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
    except JWTError:
        return False
