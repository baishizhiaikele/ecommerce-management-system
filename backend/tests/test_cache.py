import asyncio

import pytest

from app.core.cache import _MemoryCache


@pytest.mark.asyncio
async def test_memory_cache_set_get_delete():
    c = _MemoryCache(default_ttl=60)
    await c.set("k", {"a": 1}, ttl=60)
    assert await c.get("k") == {"a": 1}
    await c.delete("k")
    assert await c.get("k") is None


@pytest.mark.asyncio
async def test_memory_cache_ttl_expiry():
    c = _MemoryCache(default_ttl=1)
    await c.set("t", 1, ttl=1)
    await asyncio.sleep(1.1)
    assert await c.get("t") is None


@pytest.mark.asyncio
async def test_memory_cache_prefix_invalidation():
    c = _MemoryCache(default_ttl=60)
    await c.set("products:a", 1, ttl=60)
    await c.set("products:b", 2, ttl=60)
    await c.set("other:x", 3, ttl=60)
    removed = await c.delete_prefix("products:")
    assert removed == 2
    assert await c.get("other:x") == 3


@pytest.mark.asyncio
async def test_memory_cache_lru_eviction():
    c = _MemoryCache(maxsize=2, default_ttl=60)
    await c.set("a", 1, ttl=60)
    await c.set("b", 2, ttl=60)
    await c.set("c", 3, ttl=60)  # 触发淘汰最旧键 "a"
    assert await c.get("a") is None
    assert await c.get("c") == 3
