"""轻量级缓存层。

特性：
- 默认启用 Redis（基于 ``settings.REDIS_URL``，开发约定指向本地 ``redis://localhost:6379/0``），
  支持多进程 / 多实例共享，贴近生产大促高并发场景（P0-3）。
- 若 Redis 不可用（未启动 / 连接失败），自动降级为进程内 LRU 带 TTL 实现，
  主流程不中断（日志提示降级）。
- 测试环境（``settings.TESTING=True``）自动禁用，保证 pytest 套件数据一致性。

用法：
    val = await cache_get("key")
    if val is None:
        val = await compute()
        await cache_set("key", val, ttl=60)
    # 失效（写操作后调用）：
    await cache_delete_prefix("products:")
"""
from __future__ import annotations

import json
import logging
import time
from collections import OrderedDict
from typing import Any, Optional

from app.core.config import settings

logger = logging.getLogger("cache")

CACHE_ENABLED = not settings.TESTING
DEFAULT_TTL = 60

_redis = None
_use_redis = False
_redis_checked = False


class _MemoryCache:
    """带 TTL 的进程内 LRU 缓存；asyncio 单线程事件循环下无需加锁。"""

    def __init__(self, maxsize: int = 1000, default_ttl: int = DEFAULT_TTL):
        self._store: "OrderedDict[str, tuple[float, Any]]" = OrderedDict()
        self._maxsize = maxsize
        self._default_ttl = default_ttl

    async def get(self, key: str) -> Optional[Any]:
        item = self._store.get(key)
        if item is None:
            return None
        expire_at, value = item
        if expire_at < time.monotonic():
            self._store.pop(key, None)
            return None
        self._store.move_to_end(key)
        return value

    async def set(self, key: str, value: Any, ttl: int) -> None:
        self._store[key] = (time.monotonic() + ttl, value)
        self._store.move_to_end(key)
        while len(self._store) > self._maxsize:
            self._store.popitem(last=False)

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def delete_prefix(self, prefix: str) -> int:
        keys = [k for k in self._store if k.startswith(prefix)]
        for k in keys:
            self._store.pop(k, None)
        return len(keys)

    async def clear(self) -> None:
        self._store.clear()


_memory = _MemoryCache()


async def _get_redis():
    """惰性初始化 Redis 连接；首次调用时探活，失败则全局降级进程内缓存。"""
    global _redis, _use_redis, _redis_checked
    if _redis_checked:
        return _redis
    _redis_checked = True
    try:
        import redis.asyncio as aioredis

        client = aioredis.from_url(settings.REDIS_URL, decode_responses=False, socket_connect_timeout=1.0)
        # 探活：失败立即降级，避免后续每次请求都超时
        await client.ping()
        _redis = client
        _use_redis = True
        logger.info("缓存层已启用 Redis：%s", settings.REDIS_URL)
    except Exception as exc:  # noqa: BLE001 - 任何连接/探活错误都降级
        _use_redis = False
        logger.warning("Redis 不可用（%s），缓存降级为进程内 LRU（不共享、重启即失）。", exc)
    return _redis


def _serialize(value: Any) -> bytes:
    return json.dumps(value, default=str).encode("utf-8")


def _deserialize(raw: bytes) -> Any:
    return json.loads(raw)


async def cache_get(key: str) -> Optional[Any]:
    """返回缓存值；未命中或缓存禁用时返回 None。"""
    global _use_redis
    if not CACHE_ENABLED:
        return None
    if _use_redis or not _redis_checked:
        try:
            r = await _get_redis()
            if _use_redis and r is not None:
                raw = await r.get(key)
                return None if raw is None else _deserialize(raw)
        except Exception as exc:  # Redis 运行期抖动：降级内存并永久禁用 Redis 后端
            logger.warning("redis cache_get failed, falling back to memory: %s", exc)
            _use_redis = False
    return await _memory.get(key)


async def cache_set(key: str, value: Any, ttl: int = DEFAULT_TTL) -> None:
    """写入缓存；缓存禁用时为 no-op。"""
    global _use_redis
    if not CACHE_ENABLED:
        return
    if _use_redis or not _redis_checked:
        try:
            r = await _get_redis()
            if _use_redis and r is not None:
                await r.set(key, _serialize(value), ex=ttl)
                return
        except Exception as exc:
            logger.warning("redis cache_set failed, falling back to memory: %s", exc)
            _use_redis = False
    await _memory.set(key, value, ttl)


async def cache_delete(key: str) -> None:
    global _use_redis
    if not CACHE_ENABLED:
        return
    if _use_redis or not _redis_checked:
        try:
            r = await _get_redis()
            if _use_redis and r is not None:
                await r.delete(key)
                return
        except Exception as exc:
            logger.warning("redis cache_delete failed, falling back to memory: %s", exc)
            _use_redis = False
    await _memory.delete(key)


async def cache_delete_prefix(prefix: str) -> int:
    """删除所有以 prefix 开头的键，返回删除数量。"""
    global _use_redis
    if not CACHE_ENABLED:
        return 0
    if _use_redis or not _redis_checked:
        try:
            r = await _get_redis()
            if _use_redis and r is not None:
                count = 0
                async for k in r.scan_iter(match=f"{prefix}*"):
                    await r.delete(k)
                    count += 1
                return count
        except Exception as exc:
            logger.warning("redis cache_delete_prefix failed, falling back to memory: %s", exc)
            _use_redis = False
    return await _memory.delete_prefix(prefix)


async def cache_health() -> dict:
    """探测缓存层健康：返回后端类型与是否可用（供 /health 使用）。"""
    if not CACHE_ENABLED:
        return {"backend": "disabled", "ok": True}
    try:
        r = await _get_redis()
    except Exception:
        r = None
    if _use_redis and r is not None:
        try:
            await r.ping()
            return {"backend": "redis", "ok": True}
        except Exception as exc:
            return {"backend": "redis", "ok": False, "error": str(exc)}
    return {"backend": "memory", "ok": True}
