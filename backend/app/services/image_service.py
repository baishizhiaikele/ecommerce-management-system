"""AI 商品图生成 + 真实图床落盘（P1 收尾）。

- 网关开关：IMAGE_API_KEY / IMAGE_BASE_URL 配置完整时调用「通义万相 / OpenAI images」风格网关；
  任一缺失则自动降级为本地确定性占位图（seed 可复现）。
- 真实图床：无论网关还是降级，最终图片都落盘到 IMAGE_BED_DIR，并由 /api/images/bed 对外提供
  稳定 URL，避免商品图片依赖易失的第三方短链（接入对象存储只需改目录挂载）。
- 不抛异常：任意一步失败都回到占位图，保证商品创建/编辑链路不被 AI 阻断。
"""
from __future__ import annotations

import base64
import logging

import httpx

from app.core.config import settings
from app.services import image_bed

logger = logging.getLogger(__name__)


async def generate_images(prompt: str, count: int = 4, seed: str | None = None) -> list[str]:
    """文生图：返回 `count` 张「图床稳定 URL」候选商品图。

    返回的 URL 形如 /api/images/bed/{hash}.png，由本服务图床路由对外提供；即便网关不可用
    也至少返回一张可用图（确定性离线占位图）。seed 用于落床文件名稳定化（通常传商品 id）。
    """
    seed = seed or prompt
    if settings.IMAGE_API_KEY and settings.IMAGE_BASE_URL:
        try:
            return await _call_gateway(prompt, count, seed)
        except Exception:
            logger.warning("AI 商品图生成调用失败，降级为占位图", exc_info=True)
    return await _mock_images(prompt, count, seed)


async def _call_gateway(prompt: str, count: int, seed: str) -> list[str]:
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
        for i, item in enumerate(data[:count]):
            if item.get("b64_json"):
                raw = base64.b64decode(item["b64_json"])
                urls.append(await image_bed.save_bytes(raw, f"{seed}-{i}", ext="png"))
            elif item.get("url"):
                stored = await image_bed.fetch_and_store(item["url"], f"{seed}-{i}")
                urls.append(stored or item["url"])
        if urls:
            return urls
    # 网关返回空 -> 降级
    return await _mock_images(prompt, count, seed)


async def _mock_images(prompt: str, count: int, seed: str) -> list[str]:
    """离线确定性占位图，直接落本地图床，整条链路可端到端测试。"""
    out: list[str] = []
    for i in range(count):
        png = image_bed.render_placeholder_png(f"{seed}-{i}")
        out.append(await image_bed.save_bytes(png, f"{seed}-{i}", ext="png"))
    return out
