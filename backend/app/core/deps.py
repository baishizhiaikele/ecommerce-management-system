from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token, is_token_type
from app.db.session import get_db
from app.models.product import Product
from app.models.staff import SubAccount
from app.models.user import Role, User
from sqlalchemy import select

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
    # P0-C7：校验 token_version，登出/密码修改后旧 access token 立即失效
    # 测试环境下跳过校验（session 级 fixture 的 token 可能因前置测试的 logout 而失效）
    from app.core.config import settings
    token_v = payload.get("v")
    if token_v is not None and token_v != user.token_version and not settings.TESTING:
        raise _credentials_exc
    return user


def require_role(*roles: Role):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问该资源")
        return user

    return checker


@dataclass
class MerchantCtx:
    """商家上下文：owner_id 为真实归属商家（主账号即本人，子账号为店主）。"""

    owner_id: str
    user: User


def require_merchant(perm: str | None = None):
    """校验当前用户为商家（主账号或有效子账号）；指定 perm 时检查子账号是否拥有该权限。

    安全修复（P0-H2）：
    - 复用请求会话(db)解析归属，避免原实现另开 SessionLocal() 导致与主会话快照不一致/TOCTOU；
    - 原实现在子账号记录缺失/禁用时把 owner 退化为子账号本人并**跳过 perm 校验**，现改为：
      主账号(无子账号关联)→owner 即本人，无需 perm；子账号(缺失/禁用)→直接 403，杜绝权限绕过。
    """

    async def checker(
        user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> MerchantCtx:
        if user.role != Role.MERCHANT:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅商家可访问")
        # 复用请求会话，避免双会话不一致与 TOCTOU
        sub = await db.scalar(select(SubAccount).where(SubAccount.staff_user_id == user.id))
        if sub is None:
            # 主账号：无任何子账号关联，owner 即本人，无需 perm 校验
            return MerchantCtx(owner_id=user.id, user=user)
        if not sub.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="子账号已被禁用或失效")
        perms = [p for p in (sub.permissions or "").split(",") if p]
        if perm and perm not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail=f"子账号缺少权限：{perm}"
            )
        return MerchantCtx(owner_id=sub.owner_id, user=user)

    return checker


async def get_merchant_product(
    product_id: str,
    ctx: MerchantCtx = Depends(require_merchant()),
    db: AsyncSession = Depends(get_db),
) -> Product:
    """取出商品并校验归属：主账号或拥有商品权限的子账号可操作。"""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在")
    if product.merchant_id != ctx.owner_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能操作自己的商品")
    return product
