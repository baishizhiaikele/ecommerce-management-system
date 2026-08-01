"""可选 Sentry 错误监控（T26 可观测性收尾）。

零依赖、零密钥降级：仅当 SENTRY_DSN 配置且 sentry-sdk 已安装时启用；
否则完全 no-op，不引入任何 import 副作用，保证本地/Ci 无需安装即可运行。
"""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger(__name__)
_initialized = False


def init_sentry() -> bool:
    """惰性初始化 Sentry。成功返回 True；未配置/缺依赖返回 False。"""
    global _initialized
    if _initialized:
        return bool(_sentry_dsn())
    _initialized = True
    if not settings.SENTRY_DSN:
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.ENVIRONMENT,
            traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
            send_default_pii=False,
            integrations=[FastApiIntegration(), StarletteIntegration()],
        )
        logger.info("Sentry 已启用（environment=%s）", settings.ENVIRONMENT)
        return True
    except Exception as e:  # 依赖未装等
        logger.warning("Sentry 初始化失败，降级为 no-op：%s", e)
        return False


def _sentry_dsn() -> bool:
    return bool(getattr(settings, "SENTRY_DSN", ""))
