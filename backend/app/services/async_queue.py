"""异步任务队列（P0 基础设施）。

两种后端，自动选择：

- **redis**（默认，生产推荐）：任务经 Redis list 入队，由后台 worker 协程 pop 并执行。
  支持多进程/多实例横向扩展，进程重启不丢任务，贴近生产削峰/解耦场景。
- **inprocess**（降级）：Redis 不可用时自动回退，在事件循环外启线程 fire-and-forget 执行，
  保证主流程不中断（与旧 stub 语义一致，仅作兜底）。

对外暴露的稳定签名（调用方依赖）：
- ``enqueue(func, *args, **kwargs)``：提交一个协程任务（fire-and-forget）。
- ``stats() -> dict``：运行指标（backend / enqueued / completed / failed / in_flight）。
- ``backend() -> str``：当前生效的后端名。
- ``run_worker()``：在应用 lifespan 启动后台消费协程（仅 redis 模式有效）。
- ``stop_worker()``：优雅停止 worker。
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
import uuid
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from app.core.config import settings

logger = logging.getLogger("async_queue")

_stats: dict[str, int] = {"enqueued": 0, "completed": 0, "failed": 0, "in_flight": 0}

# 任务注册表：func 无法跨进程序列化，故通过 name 在定义端注册可调用对象。
# 本进程内 enqueue 直接引用注册对象；worker 也从中取同一对象执行。
_REGISTRY: dict[str, Callable[..., Awaitable]] = {}


def register(name: str, func: Callable[..., Awaitable]) -> None:
    """注册一个可经队列执行的任务（供本进程内 worker 反查）。"""
    _REGISTRY[name] = func


def _resolve(func: Callable[..., Awaitable]) -> str:
    # 优先复用注册名，否则用 qualname（调用方未注册时退化为模块路径不可跨进程，但同进程可用）
    for n, f in _REGISTRY.items():
        if f is func:
            return n
    return func.__qualname__


@dataclass
class _Job:
    func: Callable[..., Awaitable]
    args: tuple
    kwargs: dict
    job_id: str = field(default_factory=lambda: uuid.uuid4().hex)


# ---------------------------------------------------------------------------
# Redis 后端
# ---------------------------------------------------------------------------
_redis = None
_redis_checked = False
_use_redis = False
_QUEUE_KEY = "asyncq:jobs"
_worker_task: "asyncio.Task | None" = None
_worker_stop = False


async def _get_redis():
    global _redis, _use_redis, _redis_checked
    if settings.ASYNC_QUEUE_BACKEND != "redis":
        # 显式配置为其他后端（如 inprocess）时跳过 Redis 探测，直接使用进程内降级
        _redis_checked = True
        _use_redis = False
        return None
    if _redis_checked:
        return _redis
    _redis_checked = True
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=1.0)
        await client.ping()
        _redis = client
        _use_redis = True
        logger.info("异步队列已启用 Redis 后端：%s", settings.REDIS_URL)
    except Exception as exc:  # noqa: BLE001
        _use_redis = False
        logger.warning("Redis 不可用（%s），异步队列降级为进程内线程执行。", exc)
    return _redis


async def _worker_loop() -> None:
    """后台消费协程：从 Redis list 弹出任务并执行。"""
    global _worker_stop
    r = await _get_redis()
    if r is None:
        return
    logger.info("异步队列 worker 启动（redis 后端）")
    while not _worker_stop:
        try:
            # 阻塞弹出（最多等待 1s），避免忙等
            item = await r.blpop(_QUEUE_KEY, timeout=1)
        except Exception as exc:  # noqa: BLE001
            logger.error("异步队列 worker pop 失败：%s", exc)
            await asyncio.sleep(1)
            continue
        if not item:
            continue
        _, raw = item
        await _execute_payload(raw)
    logger.info("异步队列 worker 已停止")


async def _execute_payload(raw: str) -> None:
    _stats["in_flight"] += 1
    try:
        payload = json.loads(raw)
        name = payload["name"]
        args = payload.get("args", [])
        kwargs = payload.get("kwargs", {})
        func = _REGISTRY.get(name)
        if func is None:
            logger.error("异步队列找不到任务 %s（未 register 或跨进程）", name)
            _stats["failed"] += 1
            return
        await func(*args, **kwargs)
        _stats["completed"] += 1
    except Exception as exc:  # noqa: BLE001
        logger.exception("异步队列任务执行失败：%s", exc)
        _stats["failed"] += 1
    finally:
        _stats["in_flight"] = max(0, _stats["in_flight"] - 1)


# ---------------------------------------------------------------------------
# 进程内线程降级后端（Redis 不可用时）
# ---------------------------------------------------------------------------
def _run_in_thread(job: _Job) -> None:
    _stats["in_flight"] += 1
    try:
        asyncio.run(_coro_wrapper(job.func, job.args, job.kwargs))
        _stats["completed"] += 1
    except Exception:  # noqa: BLE001
        logger.exception("异步队列（进程内）任务执行失败")
        _stats["failed"] += 1
    finally:
        _stats["in_flight"] = max(0, _stats["in_flight"] - 1)


async def _coro_wrapper(func, args, kwargs) -> None:
    await func(*args, **kwargs)


# ---------------------------------------------------------------------------
# 对外 API
# ---------------------------------------------------------------------------
def enqueue(func: Callable[..., Awaitable], *args, **kwargs) -> None:
    """提交一个协程任务（fire-and-forget）。

    - Redis 模式：序列化 (name, args, kwargs) 入 Redis list，由后台 worker 执行。
    - 降级模式：在事件循环外启线程执行。
    """
    # 仅允许可 JSON 序列化的基础参数在 Redis 模式下安全入队；调用方通常用基本类型。
    name = _resolve(func)
    _stats["enqueued"] += 1

    if _use_redis or not _redis_checked:
        # 延迟探测（首次 enqueue 时确认 Redis 是否可达）
        async def _try_enqueue() -> None:
            r = await _get_redis()
            if r is not None:
                payload = json.dumps({"name": name, "args": list(args), "kwargs": kwargs})
                await r.rpush(_QUEUE_KEY, payload)

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_try_enqueue())
            return
        except RuntimeError:
            # 不在事件循环中（极端情况）：退化为线程执行
            pass

    # 降级：进程内线程
    job = _Job(func=func, args=args, kwargs=kwargs)
    t = threading.Thread(target=_run_in_thread, args=(job,), daemon=True)
    t.start()


def stats() -> dict:
    return {"backend": backend(), **_stats}


def backend() -> str:
    # 已确认不可用时返回降级标识
    return "redis" if _use_redis else "inprocess"


async def run_worker() -> None:
    """在应用 lifespan 启动后台消费协程（仅 redis 模式有效）。"""
    global _worker_task, _worker_stop
    r = await _get_redis()
    if r is None:
        logger.info("异步队列 worker 未启动（Redis 不可用，走进程内降级）")
        return
    _worker_stop = False
    _worker_task = asyncio.create_task(_worker_loop())


async def stop_worker() -> None:
    """优雅停止 worker。"""
    global _worker_stop, _worker_task
    _worker_stop = True
    if _worker_task is not None:
        try:
            await asyncio.wait_for(_worker_task, timeout=5)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            _worker_task.cancel()
        _worker_task = None
