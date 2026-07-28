import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Response
from jwt.exceptions import InvalidTokenError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

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


# ---------------------------------------------------------------------------
# 安全加固中间件（P1-10 / P1-5）
#
# - SecurityHeadersMiddleware：统一注入安全响应头（CSP / HSTS /
#   X-Content-Type-Options / X-Frame-Options / Referrer-Policy /
#   Permissions-Policy），并对静态资源（/uploads, /assets）设置不可变的长期缓存头。
# - MaxBodySizeMiddleware：拦截过大的 JSON / 表单请求体（默认 10MB），防止简单的内存
#   耗尽攻击（文件上传由 upload 路由基于真实内容大小校验，此处跳过）。
#
# 设计原则：同源优先、可降级。CSP 对同源内联脚本/样式放行（Vite 构建产物为外部脚本，
# antd 依赖内联 style），同时禁止 frame 嵌套、object 注入与 base 标签注入，显著
# 降低 XSS / 点击劫持风险。测试环境（TESTING=True）下不注入 CSP/HSTS，避免干扰 pytest。
# ---------------------------------------------------------------------------

_STATIC_PREFIXES = ("/uploads", "/assets")

# 同源优先的基础 CSP：放行内联样式（antd 依赖），禁止跨域脚本、frame 嵌套与插件注入。
_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob: https:; "
    "font-src 'self' data:; "
    "connect-src 'self' ws: wss:; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "object-src 'none'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        path = request.url.path

        # 静态资源：长期不可变缓存（文件名含哈希，可安全缓存一年）
        if path.startswith(_STATIC_PREFIXES):
            response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
            return response

        if not settings.TESTING:
            response.headers.setdefault("X-Content-Type-Options", "nosniff")
            response.headers.setdefault("X-Frame-Options", "DENY")
            response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
            response.headers.setdefault(
                "Permissions-Policy",
                "geolocation=(), camera=(), microphone=(), payment=()",
            )
            response.headers.setdefault("Content-Security-Policy", _CSP)
            if request.url.scheme == "https":
                response.headers.setdefault(
                    "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
                )
        return response


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """拒绝过大的非流式请求体（默认 10MB），防止简单的内存耗尽攻击。"""

    def __init__(self, app, max_bytes: int = 10 * 1024 * 1024) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next) -> Response:
        content_type = request.headers.get("content-type", "")
        # 文件上传由 upload 路由基于真实内容大小校验，这里跳过 multipart
        if "multipart/form-data" in content_type:
            return await call_next(request)
        raw = request.headers.get("content-length")
        if raw and raw.isdigit() and int(raw) > self.max_bytes:
            return JSONResponse(status_code=413, content={"detail": "请求体过大"})
        return await call_next(request)
