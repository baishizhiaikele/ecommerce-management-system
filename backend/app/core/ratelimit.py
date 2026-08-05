import logging

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

logger = logging.getLogger(__name__)


def _resolve_storage_uri() -> str:
    """P2#9：配置了 REDIS_URL 且可达时切到 Redis 限流后端，保证多实例阈值一致；
    未配置或不可达时降级为内存计数（与原行为一致），避免本地/CI 无 Redis 时启动或请求报错。
    """
    redis_url = getattr(settings, "REDIS_URL", None)
    if not redis_url or not redis_url.startswith("redis://"):
        return "memory://"
    try:
        import redis

        # 同步轻量可达性校验（导入期尚无事件循环，避免 asyncio 死锁）
        client = redis.from_url(redis_url, socket_connect_timeout=1.0)
        client.ping()
        client.close()
        return redis_url
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis 不可达，限流降级为内存计数：%s", exc)
        return "memory://"


# 按客户端 IP 限流。测试环境（TESTING=True）下关闭，避免影响 pytest 套件。
# config_filename 指向不存在的文件，使 slowapi 跳过读取含中文的 .env（否则本机 GBK 编码下会解码失败）。
# default_limits 通过 SlowAPIMiddleware 全局落地；如需更细粒度可在路由上用 @limiter.limit 覆盖。
limiter = Limiter(
    key_func=get_remote_address,
    enabled=not settings.TESTING,
    default_limits=["200/minute"],
    storage_uri=_resolve_storage_uri(),
    config_filename=".slowapi-placeholder.env",
)
