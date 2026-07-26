from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token, is_token_type
from app.db.session import get_db
from app.models.product import Product
from app.models.user import Role, User

bearer = HTTPBearer(auto_error=False)

_credentials_exc = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="未登录或令牌无效",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    # 优先 Bearer（兼容测试与旧客户端），其次读取 HttpOnly Cookie（S4：降低 XSS 盗用风险）
    token = None
    if creds and is_token_type(creds.credentials, "access"):
        token = creds.credentials
    elif is_token_type(request.cookies.get("access_token", ""), "access"):
        token = request.cookies["access_token"]
    if not token:
        raise _credentials_exc
    try:
        payload = decode_token(token)
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


async def get_merchant_product(
    product_id: str,
    user: User = Depends(require_role(Role.MERCHANT)),
    db: AsyncSession = Depends(get_db),
) -> Product:
    """取出商品并校验归属：仅商家本人可操作自己的商品（P9：消除路由层重复校验）。"""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在")
    if product.merchant_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能操作自己的商品")
    return product
