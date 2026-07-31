from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.ratelimit import limiter
from app.core.security import (
    clear_auth_cookies,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    is_token_type,
    set_auth_cookies,
    verify_password,
)
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.user import RefreshRequest, Token, UserCreate, UserLogin, UserOut
from app.services.audit_service import record

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_tokens(user: User) -> Token:
    return Token(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id, user.token_version),
    )


def _set_cookies(response: Response, user: User) -> Token:
    """签发令牌并写入 HttpOnly Cookie（S4）。"""
    tokens = _issue_tokens(user)
    set_auth_cookies(response, tokens.access_token, tokens.refresh_token)
    return tokens


@router.post("/register", response_model=Token)
@limiter.limit("5/minute")  # S2：限制注册频率，防止批量刷号
async def register(
    request: Request,
    data: UserCreate,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Token:
    exists = await db.scalar(
        select(User).where((User.username == data.username) | (User.email == data.email))
    )
    if exists:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="用户名或邮箱已存在")
    role = data.role if data.role != Role.ADMIN else Role.BUYER
    user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
        role=role,
    )
    db.add(user)
    await db.flush()
    await record(db, user.id, "register", "user", user.id, f"注册角色: {role.value}")
    await db.commit()
    await db.refresh(user)
    return _set_cookies(response, user)


@router.post("/login", response_model=Token)
@limiter.limit("30/minute")  # S2：限制登录频率，防暴力破解（本地演示放宽至 30/分钟，避免调试时误触）
async def login(
    request: Request,
    data: UserLogin,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> Token:
    user = await db.scalar(select(User).where(User.username == data.username))
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被禁用")
    await record(db, user.id, "login", "user", user.id)
    await db.commit()
    return _set_cookies(response, user)


@router.post("/refresh", response_model=Token)
async def refresh(
    request: Request,
    response: Response,
    payload: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> Token:
    # 优先读取 HttpOnly Cookie 中的刷新令牌（S4），兼容仍用请求体的旧客户端
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token and payload:
        refresh_token = payload.refresh_token
    if not refresh_token or not is_token_type(refresh_token, "refresh"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="刷新令牌无效")
    try:
        decoded = decode_token(refresh_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="刷新令牌无效")
    user = await db.get(User, decoded.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已禁用")
    # 令牌版本不匹配（已登出/被吊销）则拒绝，实现刷新令牌吊销
    if decoded.get("v", 1) != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="刷新令牌已失效，请重新登录")
    # 轮换：每次刷新都签发新的 refresh_token
    return _set_cookies(response, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    # 提升 token_version，使所有已签发的刷新令牌立即失效（吊销）
    user.token_version += 1
    await record(db, user.id, "logout", "user", user.id)
    await db.commit()
    clear_auth_cookies(response)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> User:
    return user
