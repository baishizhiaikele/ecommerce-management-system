"""进程内异步任务队列（P2 工程 stub）。

生产环境可平滑替换为 Redis / Celery：只需保持同一函数签名
`enqueue(func, *args, **kwargs)` 与 `process(...)` 语义即可。
当前实现：在事件循环外启线程执行，避免阻塞请求处理，并提供简单的内存指标。
"""
from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from app.core.config import settings

_stats = {"enqueued": 0, "completed": 0, "failed": 0}


@dataclass
class _Job:
    func: Callable[..., Awaitable]
    args: tuple
    kwargs: dict
    stats: dict = field(default_factory=lambda: _stats)


def enqueue(func: Callable[..., Awaitable], *args, **kwargs) -> None:
    """将协程任务投递到后台线程执行（进程内，fire-and-forget）。"""
    _stats["enqueued"] += 1

    def _run() -> None:
        try:
            asyncio.run(_coro_wrapper(func, args, kwargs))
            _stats["completed"] += 1
        except Exception:
            _stats["failed"] += 1

    t = threading.Thread(target=_run, daemon=True)
    t.start()


async def _coro_wrapper(func, args, kwargs) -> None:
    await func(*args, **kwargs)


def stats() -> dict:
    return dict(_stats)


def backend() -> str:
    return settings.ASYNC_QUEUE_BACKEND
