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
    FRONTEND_BASE_URL: str = "http://localhost:5173"  # 用于生成分销/种草分享链接
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
    AFFILIATE_COMMISSION_RATE: float = 0.05  # 分销佣金比例：订单实付金额的 5%
    ORDER_EXPIRE_MINUTES: int = 30  # 未支付订单自动取消的超时分钟数
    PAYMENT_SECRET: str = Field(default=..., description="支付回调验签密钥，生产环境必须注入环境变量，禁止弱默认值")
    PAYMENT_NOTIFY_BASE_URL: str = ""
    FONT_PATH: str = ""  # 图片渲染字体路径（留空则使用系统默认字体）
    FRONTEND_BASE_URL: str = "http://localhost:5173"  # 供分享链接/营销图床拼接前端地址

    # 真实支付网关密钥（P0-1）：缺省为空 -> 网关自动降级为自签/沙箱契约，保证本地与 CI 可跑
    # 生产环境通过环境变量注入；配置完整后 StripeProvider.is_live()/WxPayProvider.is_live() 返回 True
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    WECHAT_APP_ID: str = ""
    WECHAT_MCH_ID: str = ""
    WECHAT_API_KEY: str = ""

    # AI 商品图生成（P1）：未配置则走 mock 占位图降级
    IMAGE_API_KEY: str = ""
    IMAGE_BASE_URL: str = ""
    IMAGE_MODEL: str = "gpt-image-1"
    # AI 商品图「真实图床」：生成结果落地到本地图床目录并对外提供稳定 URL（P1 收尾）
    # 生产环境可改为对象存储（S3/OSS）挂载路径或外部图床同步目录；默认工作区下 media/bed/
    IMAGE_BED_DIR: str = "media/bed"
    IMAGE_BED_PUBLIC_PREFIX: str = "/api/images/bed"

    # 通知外发渠道（C10）：配置后真实投递，未配置则降级为本地日志（不阻塞主流程）
    SMTP_HOST: str = ""
    SMTP_PORT: int = 465
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMS_API_KEY: str = ""
    SMS_BASE_URL: str = ""

    # Redis 缓存 / 异步队列（P0 基础设施）：默认指向本地 Redis；
    # 若运行时连接失败，cache.py / async_queue.py 会自动降级为进程内实现，不阻断主流程。
    REDIS_URL: str = "redis://localhost:6379/0"

    # 异步任务队列（P0 基础设施）：默认 redis（需 REDIS_URL 可达），
    # 不可达时 async_queue 自动降级为进程内后台线程执行。
    ASYNC_QUEUE_BACKEND: str = "redis"

    # 可观测性接外部 APM（P2 收尾）：OpenTelemetry 链路追踪，可选开启
    # 不安装 opentelemetry 依赖、或未置 OTEL_ENABLED=true 时完全降级，不影响启动与测试
    OTEL_ENABLED: bool = False
    OTEL_SERVICE_NAME: str = "ecommerce-backend"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = ""  # 例如 http://localhost:4317
    OTEL_EXPORTER_OTLP_HEADERS: str = ""  # 逗号分隔的 key=value（如鉴权头）
    # 采样比例：1.0=全采；高流量可调小
    OTEL_TRACES_SAMPLER_ARG: float = 1.0

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
