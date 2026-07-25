from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    is_token_type,
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


@router.post("/register", response_model=Token)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)) -> Token:
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
    return _issue_tokens(user)


@router.post("/login", response_model=Token)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)) -> Token:
    user = await db.scalar(select(User).where(User.username == data.username))
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被禁用")
    await record(db, user.id, "login", "user", user.id)
    await db.commit()
    return _issue_tokens(user)


@router.post("/refresh", response_model=Token)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)) -> Token:
    if not is_token_type(payload.refresh_token, "refresh"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="刷新令牌无效")
    try:
        decoded = decode_token(payload.refresh_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="刷新令牌无效")
    user = await db.get(User, decoded.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已禁用")
    # 令牌版本不匹配（已登出/被吊销）则拒绝，实现刷新令牌吊销
    if decoded.get("v", 1) != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="刷新令牌已失效，请重新登录")
    # 轮换：每次刷新都签发新的 refresh_token
    return _issue_tokens(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    # 提升 token_version，使所有已签发的刷新令牌立即失效（吊销）
    user.token_version += 1
    await record(db, user.id, "logout", "user", user.id)
    await db.commit()


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> User:
    return user
