from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "AI 全托管小店"
    API_V1_PREFIX: str = "/api"
    DATABASE_URL: str = "sqlite+aiosqlite:///./ai_shop.db"
    # 安全（S1）：不再提供弱默认密钥；生产必须通过环境变量注入，缺失则在启动时失败
    SECRET_KEY: str = Field(
        ...,
        description="JWT 签名密钥，生产环境必须通过环境变量注入，禁止使用弱默认值",
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    FRONTEND_ORIGINS: list[str] = ["http://localhost:5173"]
    # 测试环境下关闭限流，避免影响 pytest 套件
    TESTING: bool = False
    # 是否在启动时灌入演示数据（含弱口令演示账号）；生产环境应显式设为 False
    SEED_DEMO: bool = True

    AI_API_KEY: str = ""
    AI_BASE_URL: str = "https://api.openai.com/v1"
    AI_MODEL: str = "gpt-4o-mini"
    AI_TIMEOUT_SECONDS: float = 12.0

    # 支付网关（P0 真实支付接入）：默认 sandbox 自测网关，生产切换为 alipay/wechat 并注入密钥
    PAYMENT_GATEWAY: str = "sandbox"

    # 业务规则（P2-16 / P2-18）
    MAX_COUPONS_PER_ORDER: int = 1  # 每单最多使用的优惠券张数
    DEFAULT_LOW_STOCK_THRESHOLD: int = 10  # 商品未单独设置阈值时的默认低库存阈值
    PAYMENT_SECRET: str = "change-me-in-prod-payment-secret"
    PAYMENT_NOTIFY_BASE_URL: str = ""

    # AI 商品图生成（P1）：未配置则走 mock 占位图降级
    IMAGE_API_KEY: str = ""
    IMAGE_BASE_URL: str = ""
    IMAGE_MODEL: str = "gpt-image-1"

    # 异步任务队列（P2 工程）：默认进程内后台执行，生产可切换 redis/celery
    ASYNC_QUEUE_BACKEND: str = "inprocess"

    @property
    def async_database_url(self) -> str:
        """返回 SQLAlchemy 异步引擎可用的数据库 URL。

        Render 等平台提供的 PostgreSQL 连接串为同步驱动（postgresql://），
        异步引擎需替换为 postgresql+asyncpg://；SQLite 与已带驱动的 URL 保持不变。
        """
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            url = "postgresql+asyncpg://" + url[len("postgresql://"):]
        if "sslmode=" in url:
            url = url.replace("sslmode=require", "ssl=true").replace("sslmode=disable", "ssl=false")
        return url


settings = Settings()
