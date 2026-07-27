"""AI 商品图生成（P1 差异化）。

配置了 IMAGE_API_KEY / IMAGE_BASE_URL 时调用图像生成网关；否则降级为确定性
占位图（picsum），保证离线 / 测试环境下功能闭环可用。
"""
from __future__ import annotations

import hashlib
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_MOCK_TEMPLATE = "https://picsum.photos/seed/{seed}/600/600"


async def generate_images(prompt: str, count: int = 4) -> list[str]:
    """文生图：返回 `count` 张候选商品图 URL。"""
    if settings.IMAGE_API_KEY and settings.IMAGE_BASE_URL:
        try:
            return await _call_gateway(prompt, count)
        except Exception:
            logger.warning("AI 商品图生成调用失败，降级为占位图", exc_info=True)
    return _mock_images(prompt, count)


async def _call_gateway(prompt: str, count: int) -> list[str]:
    payload = {
        "model": settings.IMAGE_MODEL,
        "prompt": prompt,
        "n": count,
        "size": "600x600",
    }
    async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            f"{settings.IMAGE_BASE_URL.rstrip('/')}/images/generations",
            headers={"Authorization": f"Bearer {settings.IMAGE_API_KEY}"},
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        urls: list[str] = []
        for item in data:
            if item.get("url"):
                urls.append(item["url"])
            elif item.get("b64_json"):
                urls.append(f"data:image/png;base64,{item['b64_json']}")
        return urls


def _mock_images(prompt: str, count: int) -> list[str]:
    out: list[str] = []
    for i in range(count):
        seed = hashlib.md5(f"{prompt}-{i}".encode("utf-8")).hexdigest()[:10]
        out.append(_MOCK_TEMPLATE.format(seed=seed))
    return out
