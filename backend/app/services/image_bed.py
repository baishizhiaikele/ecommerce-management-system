"""AI 商品图真实图床：把生成结果落地到稳定可访问的本地图床。

- 在线（有图床网关/外部 URL）：把 b64 或外链下载后转存到本地图床目录，返回固定 URL，
  避免商品图片依赖易失的第三方短链。
- 离线（无密钥降级）：用确定性算法渲染 PNG 落床，整条「生成→落床→挂商品」链路可端到端测试。
- 生产可将 IMAGE_BED_DIR 指向对象存储挂载目录或外部图床同步目录。
"""
from __future__ import annotations

import hashlib
import os
import random

from pathlib import Path

import httpx

from app.core.config import settings

_BED_PATH = Path(settings.IMAGE_BED_DIR)
_BED_PUBLIC_PREFIX = settings.IMAGE_BED_PUBLIC_PREFIX


def _ensure_bed() -> Path:
    _BED_PATH.mkdir(parents=True, exist_ok=True)
    return _BED_PATH


def public_url(filename: str) -> str:
    return f"{_BED_PUBLIC_PREFIX}/{filename}"


def local_path(filename: str) -> Path:
    return _BED_PATH / filename


def _safe_name(seed: str, ext: str = "png") -> str:
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]
    return f"{digest}.{ext}"


async def save_bytes(data: bytes, seed: str, ext: str = "png") -> str:
    """落盘到图床并返回对外公开 URL。"""
    _ensure_bed()
    filename = _safe_name(seed, ext)
    path = local_path(filename)
    path.write_bytes(data)
    return public_url(filename)


async def fetch_and_store(url: str, seed: str, ext: str = "png") -> str | None:
    """下载外部 URL 并转存到本地图床，返回稳定 URL；失败返回 None。"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return await save_bytes(resp.content, seed, ext)
    except Exception:
        return None


def render_placeholder_png(seed: str, size: tuple[int, int] = (512, 512)) -> bytes:
    """确定性离线占位图：根据 seed 生成稳定配色，落床后可复现。"""
    from PIL import Image, ImageDraw

    rng = random.Random(int(hashlib.sha1(seed.encode("utf-8")).hexdigest()[:8], 16))
    hue = rng.randint(0, 360)
    import colorsys

    r, g, b = colorsys.hsv_to_rgb(hue / 360.0, 0.45, 0.9)
    bg = (int(r * 255), int(g * 255), int(b * 255))
    fg = (255, 255, 255)
    img = Image.new("RGB", size, bg)
    d = ImageDraw.Draw(img)
    # 简单几何装饰，保证不同 seed 视觉可区分
    for _ in range(3):
        x0, y0 = rng.randint(0, size[0]), rng.randint(0, size[1])
        x1, y1 = rng.randint(0, size[0]), rng.randint(0, size[1])
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        d.ellipse([x0, y0, x1, y1], outline=fg, width=6)
    import io

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
