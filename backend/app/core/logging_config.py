"""结构化日志（P2-11）。

将根日志配置为单行 JSON 输出，便于 ELK / Loki 等日志系统采集。测试环境下保持默认
（人类可读）格式，避免污染 pytest 输出。重复调用安全（仅在尚未配置时生效）。
"""
from __future__ import annotations

import json
import logging
import sys
import time

_CONFIGURED = False


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: int = logging.INFO) -> None:
    """配置根日志为 JSON 输出。幂等：仅首次调用生效。"""
    global _CONFIGURED
    if _CONFIGURED:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    _CONFIGURED = True
