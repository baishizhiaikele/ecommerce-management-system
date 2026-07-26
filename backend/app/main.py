import importlib
import os

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.api.admin import router as admin_router
from app.api.ai import router as ai_router
from app.api.auth import router as auth_router
from app.api.cart import router as cart_router
from app.api.categories import router as categories_router
from app.api.coupons import router as coupons_router
from app.api.favorites import router as favorites_router
from app.api.health import router as health_router
from app.api.merchant import router as merchant_router
from app.api.notifications import router as notifications_router
from app.api.orders import router as orders_router
from app.api.points import router as points_router
from app.api.products import router as products_router
from app.api.recommendations import router as recommendations_router
from app.api.reviews import router as reviews_router
from app.api.shops import router as shops_router
from app.api.support import router as support_router
from app.api.upload import UPLOAD_DIR
from app.core.config import settings
from app.core.seed import seed_demo
from app.db.base import Base
from app.db.session import engine
from app.events_handlers import register_handlers
from app.core.ratelimit import limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# 注册所有模型，确保建表元数据完整
importlib.import_module("app.models")


@asynccontextmanager
async def lifespan(app: FastAPI):
    register_handlers()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # 兼容旧库：补充新增列（非破坏性，列已存在则忽略）
        for stmt in (
            "ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE users ADD COLUMN points INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE products ADD COLUMN sales_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE orders ADD COLUMN discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0",
            "ALTER TABLE orders ADD COLUMN refund_reason TEXT",
            "ALTER TABLE orders ADD COLUMN tracking_no VARCHAR(60)",
            "ALTER TABLE orders ADD COLUMN logistics TEXT",
        ):
            try:
                await conn.execute(text(stmt))
            except OperationalError as e:
                # 仅吞掉“列已存在”类错误；语法/权限等真实错误必须暴露，避免静默丢失迁移（P10 轻量健壮化）
                msg = str(e).lower()
                if "duplicate column" in msg or "already exists" in msg:
                    continue
                raise
    await seed_demo()
    yield


app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# 限流（S2）：按客户端 IP 限制敏感接口频率；测试环境（TESTING=True）已在 ratelimit 中禁用
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    # P6：收窄允许的请求头，避免不必要的暴露
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

app.include_router(health_router, prefix=settings.API_V1_PREFIX)
app.include_router(auth_router, prefix=settings.API_V1_PREFIX)
app.include_router(categories_router, prefix=settings.API_V1_PREFIX)
app.include_router(products_router, prefix=settings.API_V1_PREFIX)
app.include_router(reviews_router, prefix=settings.API_V1_PREFIX)
app.include_router(cart_router, prefix=settings.API_V1_PREFIX)
app.include_router(orders_router, prefix=settings.API_V1_PREFIX)
app.include_router(ai_router, prefix=settings.API_V1_PREFIX)
app.include_router(merchant_router, prefix=settings.API_V1_PREFIX)
app.include_router(admin_router, prefix=settings.API_V1_PREFIX)
app.include_router(coupons_router, prefix=settings.API_V1_PREFIX)
app.include_router(favorites_router, prefix=settings.API_V1_PREFIX)
app.include_router(notifications_router, prefix=settings.API_V1_PREFIX)
app.include_router(points_router, prefix=settings.API_V1_PREFIX)
app.include_router(recommendations_router, prefix=settings.API_V1_PREFIX)
app.include_router(support_router, prefix=settings.API_V1_PREFIX)
app.include_router(shops_router, prefix=settings.API_V1_PREFIX)


# ---- 上传文件静态服务（开发/生产均生效）----
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


# ---- 生产环境：若镜像内包含前端构建产物则同源托管（开发环境无此目录，自动跳过）----
_STATIC_DIR = os.environ.get("APP_STATIC_DIR", "/app/static").strip()
if os.path.isdir(_STATIC_DIR):
    _assets_dir = os.path.join(_STATIC_DIR, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # API 与文档路由已在上方优先注册并匹配，这里仅兜底返回 SPA 入口（含首页 /）
        index_file = os.path.join(_STATIC_DIR, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Not Found")
