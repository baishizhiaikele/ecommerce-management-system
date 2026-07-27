from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# 按客户端 IP 限流。测试环境（TESTING=True）下关闭，避免影响 pytest 套件。
# config_filename 指向不存在的文件，使 slowapi 跳过读取含中文的 .env（否则本机 GBK 编码下会解码失败）。
# default_limits 通过 SlowAPIMiddleware 全局落地；如需更细粒度可在路由上用 @limiter.limit 覆盖。
limiter = Limiter(
    key_func=get_remote_address,
    enabled=not settings.TESTING,
    default_limits=["200/minute"],
    config_filename=".slowapi-placeholder.env",
)
