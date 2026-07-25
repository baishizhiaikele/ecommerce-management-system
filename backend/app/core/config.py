from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "AI 全托管小店"
    API_V1_PREFIX: str = "/api"
    DATABASE_URL: str = "sqlite+aiosqlite:///./ai_shop.db"
    SECRET_KEY: str = "dev-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    FRONTEND_ORIGINS: list[str] = ["http://localhost:5173"]

    AI_API_KEY: str = ""
    AI_BASE_URL: str = "https://api.openai.com/v1"
    AI_MODEL: str = "gpt-4o-mini"
    AI_TIMEOUT_SECONDS: float = 12.0

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
