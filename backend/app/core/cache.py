"""轻量级缓存层。

特性：
- 默认进程内 LRU（带 TTL），零外部依赖，适合开发 / 小流量场景。
- 若环境变量 ``REDIS_URL`` 存在，自动切换为 Redis（redis.asyncio），支持多进程 / 多实例共享。
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
import os
import time
from collections import OrderedDict
from typing import Any, Optional

from app.core.config import settings

CACHE_ENABLED = not settings.TESTING
DEFAULT_TTL = 60

_redis = None
_use_redis = bool(os.getenv("REDIS_URL"))


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
    global _redis
    if _redis is None:
        import redis.asyncio as aioredis

        _redis = aioredis.from_url(os.getenv("REDIS_URL"), decode_responses=False)
    return _redis


def _serialize(value: Any) -> bytes:
    return json.dumps(value, default=str).encode("utf-8")


def _deserialize(raw: bytes) -> Any:
    return json.loads(raw)


async def cache_get(key: str) -> Optional[Any]:
    """返回缓存值；未命中或缓存禁用时返回 None。"""
    if not CACHE_ENABLED:
        return None
    if _use_redis:
        r = await _get_redis()
        raw = await r.get(key)
        return None if raw is None else _deserialize(raw)
    return await _memory.get(key)


async def cache_set(key: str, value: Any, ttl: int = DEFAULT_TTL) -> None:
    """写入缓存；缓存禁用时为 no-op。"""
    if not CACHE_ENABLED:
        return
    if _use_redis:
        r = await _get_redis()
        await r.set(key, _serialize(value), ex=ttl)
        return
    await _memory.set(key, value, ttl)


async def cache_delete(key: str) -> None:
    if not CACHE_ENABLED:
        return
    if _use_redis:
        r = await _get_redis()
        await r.delete(key)
        return
    await _memory.delete(key)


async def cache_delete_prefix(prefix: str) -> int:
    """删除所有以 prefix 开头的键，返回删除数量。"""
    if not CACHE_ENABLED:
        return 0
    if _use_redis:
        r = await _get_redis()
        count = 0
        async for k in r.scan_iter(match=f"{prefix}*"):
            await r.delete(k)
            count += 1
        return count
    return await _memory.delete_prefix(prefix)
