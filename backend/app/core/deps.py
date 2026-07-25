from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token, is_token_type
from app.db.session import get_db
from app.models.user import Role, User

bearer = HTTPBearer(auto_error=False)

_credentials_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="未登录或令牌无效",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not creds or not is_token_type(creds.credentials, "access"):
        raise _credentials_exc
    try:
        payload = decode_token(creds.credentials)
    except Exception:
        raise _credentials_exc
    user = await db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise _credentials_exc
    return user


def require_role(*roles: Role):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该资源")
        return user

    return checker
