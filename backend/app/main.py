import asyncio
import importlib
import logging
import os
from pathlib import Path

from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError
from alembic.config import Config
from alembic import command

from app.api.admin import router as admin_router
from app.api.ai import router as ai_router
from app.api.auth import router as auth_router
from app.api.banners import router as banners_router
from app.api.cart import router as cart_router
from app.api.categories import router as categories_router
from app.api.coupons import router as coupons_router
from app.api.promotions import router as promotions_router
from app.api.rewards import router as rewards_router
from app.api.inventory import router as inventory_router
from app.api.search import router as search_router
from app.api.variant import router as variant_router
from app.api.follow import router as follow_router
from app.api.users import router as users_router
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
from app.api.upload import UPLOAD_DIR, router as upload_router
from app.api.ws import router as ws_router
from app.api.shipping import router as shipping_router
from app.api.payments import router as payments_router
from app.api.agent import router as agent_router
from app.api.marketing import router as marketing_router
from app.api.decoration import router as decoration_router
from app.api.notes import router as notes_router
from app.api.plus import router as plus_router
from app.api.qna import router as qna_router
from app.api.views import router as views_router
from app.api.knowledge import router as knowledge_router
from app.api.affiliate import router as affiliate_router
from app.api.live import router as live_router
from app.api.images import router as images_router
from app.api.invoices import router as invoices_router
from app.api.presale import router as presale_router
from app.api.staff import router as staff_router
from app.api.report import router as report_router
from app.core.config import settings
from app.core.seed import seed_demo
from app.events_handlers import register_handlers
from app.core.scheduler import scheduler_loop
from app.core.ratelimit import limiter
from app.core.metrics import MetricsMiddleware, render as render_metrics
from app.core.security import SecurityHeadersMiddleware, MaxBodySizeMiddleware
from app.core.logging_config import setup_logging
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

# 注册所有模型，确保建表元数据完整
importlib.import_module("app.models")


BACKEND_ROOT = Path(__file__).resolve().parent.parent

logger = logging.getLogger(__name__)


def _run_alembic_upgrade() -> None:
    """在独立线程中同步执行 Alembic 升级，避免与运行中的事件循环冲突。"""
    cfg = Config(str(BACKEND_ROOT / "alembic.ini"))
    command.upgrade(cfg, "head")


# ---- 演进式 schema 补充列定义（幂等；生产环境应改用 Alembic migration）----
_DEMO_COLUMN_DEFS = [
    ("reviews", "reply", "ALTER TABLE reviews ADD COLUMN reply TEXT"),
    ("reviews", "is_pinned", "ALTER TABLE reviews ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0"),
    ("order_items", "variant_info", "ALTER TABLE order_items ADD COLUMN variant_info TEXT"),
    ("order_items", "variant_id", "ALTER TABLE order_items ADD COLUMN variant_id TEXT"),
    ("coupons", "applicable_category", "ALTER TABLE coupons ADD COLUMN applicable_category VARCHAR(80)"),
    ("orders", "refund_amount", "ALTER TABLE orders ADD COLUMN refund_amount NUMERIC NOT NULL DEFAULT 0"),
    ("orders", "refund_rejections", "ALTER TABLE orders ADD COLUMN refund_rejections INTEGER NOT NULL DEFAULT 0"),
    ("cart_items", "variant_id", "ALTER TABLE cart_items ADD COLUMN variant_id TEXT"),
    ("reviews", "helpful_count", "ALTER TABLE reviews ADD COLUMN helpful_count INTEGER NOT NULL DEFAULT 0"),
    ("reviews", "report_count", "ALTER TABLE reviews ADD COLUMN report_count INTEGER NOT NULL DEFAULT 0"),
    ("products", "warning_threshold", "ALTER TABLE products ADD COLUMN warning_threshold INTEGER NOT NULL DEFAULT 10"),
    ("orders", "return_tracking_no", "ALTER TABLE orders ADD COLUMN return_tracking_no VARCHAR(60)"),
    ("orders", "return_carrier", "ALTER TABLE orders ADD COLUMN return_carrier VARCHAR(60)"),
    ("orders", "dispute_reason", "ALTER TABLE orders ADD COLUMN dispute_reason TEXT"),
    ("orders", "return_requested_at", "ALTER TABLE orders ADD COLUMN return_requested_at TIMESTAMP"),
    ("orders", "return_shipped_at", "ALTER TABLE orders ADD COLUMN return_shipped_at TIMESTAMP"),
    ("orders", "return_received_at", "ALTER TABLE orders ADD COLUMN return_received_at TIMESTAMP"),
    ("orders", "exchange_at", "ALTER TABLE orders ADD COLUMN exchange_at TIMESTAMP"),
    ("payments", "escrow_status", "ALTER TABLE payments ADD COLUMN escrow_status VARCHAR(20) NOT NULL DEFAULT 'none'"),
    ("payments", "released_at", "ALTER TABLE payments ADD COLUMN released_at TIMESTAMP"),
    ("promotions", "stock_limit", "ALTER TABLE promotions ADD COLUMN stock_limit INTEGER"),
    ("promotions", "stock_sold", "ALTER TABLE promotions ADD COLUMN stock_sold INTEGER NOT NULL DEFAULT 0"),
    ("orders", "delivery_type", "ALTER TABLE orders ADD COLUMN delivery_type VARCHAR(20) NOT NULL DEFAULT 'express'"),
    ("orders", "pickup_store", "ALTER TABLE orders ADD COLUMN pickup_store VARCHAR(200)"),
    ("orders", "pickup_code", "ALTER TABLE orders ADD COLUMN pickup_code VARCHAR(12)"),
    ("orders", "picked_up_at", "ALTER TABLE orders ADD COLUMN picked_up_at TIMESTAMP"),
    ("reviews", "images", "ALTER TABLE reviews ADD COLUMN images TEXT"),
    ("reviews", "video", "ALTER TABLE reviews ADD COLUMN video VARCHAR(512)"),
    ("reviews", "append_content", "ALTER TABLE reviews ADD COLUMN append_content TEXT"),
    ("reviews", "append_at", "ALTER TABLE reviews ADD COLUMN append_at TIMESTAMP"),
    ("reviews", "append_images", "ALTER TABLE reviews ADD COLUMN append_images TEXT"),
    ("reviews", "report_reason", "ALTER TABLE reviews ADD COLUMN report_reason TEXT"),
    ("promotions", "threshold_amount", "ALTER TABLE promotions ADD COLUMN threshold_amount NUMERIC"),
    ("promotions", "gift_product_id", "ALTER TABLE promotions ADD COLUMN gift_product_id VARCHAR(36)"),
    ("promotions", "bundle_count", "ALTER TABLE promotions ADD COLUMN bundle_count INTEGER"),
    ("promotions", "bundle_price", "ALTER TABLE promotions ADD COLUMN bundle_price NUMERIC"),
    ("invoices", "pdf_url", "ALTER TABLE invoices ADD COLUMN pdf_url VARCHAR(512)"),
    ("support_tickets", "order_id", "ALTER TABLE support_tickets ADD COLUMN order_id VARCHAR(36)"),
    ("support_tickets", "priority", "ALTER TABLE support_tickets ADD COLUMN priority VARCHAR(20) NOT NULL DEFAULT 'normal'"),
    ("support_tickets", "category", "ALTER TABLE support_tickets ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'other'"),
    ("support_tickets", "satisfaction_rating", "ALTER TABLE support_tickets ADD COLUMN satisfaction_rating INTEGER"),
    ("support_tickets", "satisfaction_comment", "ALTER TABLE support_tickets ADD COLUMN satisfaction_comment TEXT"),
    ("support_tickets", "unread_for_buyer", "ALTER TABLE support_tickets ADD COLUMN unread_for_buyer INTEGER NOT NULL DEFAULT 0"),
    ("support_tickets", "unread_for_merchant", "ALTER TABLE support_tickets ADD COLUMN unread_for_merchant INTEGER NOT NULL DEFAULT 0"),
    ("support_messages", "is_internal", "ALTER TABLE support_messages ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0"),
]
_DEMO_ENUM_UPDATES = [
    "UPDATE support_tickets SET status = LOWER(status) WHERE status IN ('OPEN','ANSWERED','CLOSED')",
    "UPDATE support_tickets SET priority = LOWER(priority) WHERE priority IN ('LOW','NORMAL','HIGH','URGENT')",
    "UPDATE support_tickets SET category = LOWER(category) WHERE category IN ('INQUIRY','AFTERSALE','LOGISTICS','OTHER')",
    "UPDATE support_messages SET sender_role = LOWER(sender_role) WHERE sender_role IN ('BUYER','MERCHANT','AI')",
]


async def _ensure_demo_columns() -> None:
    """演示项目演进式补充列（幂等，重复执行安全）；生产环境应改用 Alembic migration。

    使用**同步引擎**执行，规避 aiosqlite 异步连接上 run_sync 在 uvicorn 事件循环下的死锁。
    """
    from sqlalchemy import create_engine, inspect, text
    from sqlalchemy.pool import NullPool

    _url = settings.async_database_url
    _sync_url = _url.replace("sqlite+aiosqlite", "sqlite") if _url.startswith("sqlite") else _url
    engine = create_engine(_sync_url, poolclass=NullPool)
    try:
        insp = inspect(engine)
        tables = set(insp.get_table_names())
        existing_cols = {
            tbl: {c["name"] for c in insp.get_columns(tbl)} for tbl in tables
        }
        pending_ddl = [
            sql for (tbl, col, sql) in _DEMO_COLUMN_DEFS
            if tbl not in tables or col not in existing_cols.get(tbl, set())
        ]
        with engine.begin() as conn:
            for stmt in pending_ddl + _DEMO_ENUM_UPDATES:
                try:
                    conn.execute(text(stmt))
                except Exception as e:  # noqa: BLE001
                    logger.warning("ensure_demo_columns skip (已存在或类型不兼容): %s | %s", stmt, e)
    finally:
        engine.dispose()


async def _reconcile_settlement_index() -> None:
    """兼容旧库：结算唯一约束由 (order_id) 升级为 (order_id, merchant_id)。

    旧库仅存在 uq_settlement_order，多商家订单无法分别结算；此处幂等删除旧索引
    并创建新索引（仅 SQLite 需要，其他数据库由 Alembic migration 负责）。
    """
    _url = settings.async_database_url
    if not _url.startswith("sqlite"):
        return
    from sqlalchemy import create_engine, text
    from sqlalchemy.pool import NullPool

    _sync_url = _url.replace("sqlite+aiosqlite", "sqlite")
    engine = create_engine(_sync_url, poolclass=NullPool)
    try:
        with engine.begin() as conn:
            conn.execute(text("DROP INDEX IF EXISTS uq_settlement_order"))
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_order_merchant "
                    "ON settlements(order_id, merchant_id)"
                )
            )
    finally:
        engine.dispose()


async def _ensure_demo_indexes() -> None:
    """幂等补充索引（兼容既有旧库；新库由 create_all 建好）。"""
    from sqlalchemy import text

    from app.db.session import engine

    indexes = [
        "CREATE INDEX IF NOT EXISTS ix_product_price ON products(price)",
        "CREATE INDEX IF NOT EXISTS ix_product_sales ON products(sales_count)",
        "CREATE INDEX IF NOT EXISTS ix_product_created ON products(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_product_cat_status ON products(category_id, status)",
        "CREATE INDEX IF NOT EXISTS ix_order_created ON orders(created_at)",
        "CREATE INDEX IF NOT EXISTS ix_order_buyer_created ON orders(buyer_id, created_at)",
    ]
    async with engine.begin() as conn:
        for sql in indexes:
            try:
                await conn.execute(text(sql))
            except Exception:  # noqa: BLE001
                pass


async def run_migrations() -> None:
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _run_alembic_upgrade)
    # 补充索引（幂等，兼容旧库）
    await _ensure_demo_indexes()
    # 建表兜底：仅创建 Alembic 迁移中尚未覆盖的新增表（对已存在表幂等无副作用）
    from app.db.base import Base
    from app.db.session import engine

    # 建表兜底：用同步引擎执行，规避 aiosqlite 异步连接 run_sync 死锁
    from sqlalchemy import create_engine
    from sqlalchemy.pool import NullPool

    _url = settings.async_database_url
    _sync_url = _url.replace("sqlite+aiosqlite", "sqlite") if _url.startswith("sqlite") else _url
    _sync_engine = create_engine(_sync_url, poolclass=NullPool)
    try:
        Base.metadata.create_all(_sync_engine)
    finally:
        _sync_engine.dispose()
    await _ensure_demo_columns()
    # 兼容旧库：结算唯一约束升级为 (order_id, merchant_id)，支持多商家分别结算
    await _reconcile_settlement_index()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 结构化日志（P2-11）：生产用 JSON 单行，测试保持可读
    if not settings.TESTING:
        setup_logging()
    register_handlers()
    # 通过 Alembic 将数据库 schema 升级到最新版本（幂等，兼容既有旧库）
    await run_migrations()
    # 演示数据（含弱口令演示账号）仅在 SEED_DEMO=True 时灌入，生产应关闭
    if settings.SEED_DEMO:
        try:
            await seed_demo()
        except IntegrityError:
            pass
    # 后台定时任务：自动取消超时未支付订单并回补库存
    expire_task = asyncio.create_task(scheduler_loop(60))
    try:
        yield
    finally:
        expire_task.cancel()
        with suppress(asyncio.CancelledError):
            await expire_task


app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# 限流（S2）：按客户端 IP 限制全局请求频率；测试环境（TESTING=True）已在 ratelimit 中禁用
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
if not settings.TESTING:
    # 全局默认限流通过中间件落地（无需在每个路由上添加 request 参数）
    app.add_middleware(SlowAPIMiddleware)

# 可观测性（P2）：请求指标中间件（始终开启，开销极低）
app.add_middleware(MetricsMiddleware)

# 安全加固（P1-10 / P1-5）：安全响应头 + 请求体大小限制
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(MaxBodySizeMiddleware)

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
app.include_router(banners_router, prefix=settings.API_V1_PREFIX)
app.include_router(promotions_router, prefix=settings.API_V1_PREFIX)
app.include_router(users_router, prefix=settings.API_V1_PREFIX)
app.include_router(rewards_router, prefix=settings.API_V1_PREFIX)
app.include_router(inventory_router, prefix=settings.API_V1_PREFIX)
app.include_router(search_router, prefix=settings.API_V1_PREFIX)
app.include_router(variant_router, prefix=settings.API_V1_PREFIX)
app.include_router(follow_router, prefix=settings.API_V1_PREFIX)
app.include_router(ws_router, prefix=settings.API_V1_PREFIX)
app.include_router(shipping_router, prefix=settings.API_V1_PREFIX)
app.include_router(payments_router, prefix=settings.API_V1_PREFIX)
app.include_router(agent_router, prefix=settings.API_V1_PREFIX)
app.include_router(marketing_router, prefix=settings.API_V1_PREFIX)
app.include_router(decoration_router, prefix=settings.API_V1_PREFIX)
app.include_router(notes_router, prefix=settings.API_V1_PREFIX)
app.include_router(plus_router, prefix=settings.API_V1_PREFIX)
app.include_router(qna_router, prefix=settings.API_V1_PREFIX)
app.include_router(views_router, prefix=settings.API_V1_PREFIX)
app.include_router(knowledge_router, prefix=settings.API_V1_PREFIX)
app.include_router(affiliate_router, prefix=settings.API_V1_PREFIX)
app.include_router(live_router, prefix=settings.API_V1_PREFIX)
app.include_router(invoices_router, prefix=settings.API_V1_PREFIX)
app.include_router(presale_router, prefix=settings.API_V1_PREFIX)
app.include_router(images_router, prefix=settings.API_V1_PREFIX)
app.include_router(upload_router, prefix=settings.API_V1_PREFIX)
app.include_router(staff_router, prefix=settings.API_V1_PREFIX)
app.include_router(report_router, prefix=settings.API_V1_PREFIX)


# ---- 可观测性：Prometheus 风格指标端点（无需鉴权，供监控抓取）----
@app.get("/metrics", include_in_schema=False)
async def metrics() -> str:
    return render_metrics()


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
