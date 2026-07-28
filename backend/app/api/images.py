"""图片本地代理：将外部图床（picsum / Wikimedia 等）经后端转发并缓存。

解决的问题：
- 外链不稳/慢：后端拉取一次后落盘缓存，后续直接本地返回。
- 混合内容/CORS：前端始终走同源 /api 路径，规避跨域与 https 降级问题。
- SSRF 防护：仅放行白名单主机，且限制响应大小。
"""
import hashlib
import mimetypes
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

router = APIRouter(prefix="/images", tags=["images"])

ALLOWED_HOSTS = {
    "picsum.photos",
    "fastly.picsum.photos",
    "upload.wikimedia.org",
    "commons.wikimedia.org",
    "images.unsplash.com",
    "source.unsplash.com",
    # 演示种子数据商品图使用 loremflickr，需放行以正常加载
    "loremflickr.com",
}
MAX_BYTES = 5 * 1024 * 1024  # 单图上限 5MB
CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache" / "img"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/proxy")
async def proxy_image(
    u: str = Query(..., description="待代理的外部图片 URL（仅限白名单主机）"),
) -> Response:
    if not (u.startswith("http://") or u.startswith("https://")):
        raise HTTPException(status_code=400, detail="仅支持 http/https 图片")
    from urllib.parse import urlparse

    host = urlparse(u).hostname or ""
    if host not in ALLOWED_HOSTS:
        raise HTTPException(status_code=400, detail=f"不支持的图片主机：{host}")

    key = hashlib.sha256(u.encode()).hexdigest()
    cached = CACHE_DIR / key
    if cached.exists():
        return Response(
            content=cached.read_bytes(),
            media_type=mimetypes.guess_type(u)[0] or "image/jpeg",
        )

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            async with client.stream("GET", u) as resp:
                if resp.status_code != 200:
                    raise HTTPException(status_code=502, detail="上游图片获取失败")
                data = b""
                async for chunk in resp.aiter_bytes():
                    data += chunk
                    if len(data) > MAX_BYTES:
                        raise HTTPException(status_code=502, detail="图片过大")
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="图片代理异常")

    ctype = resp.headers.get("content-type") or mimetypes.guess_type(u)[0] or "image/jpeg"
    cached.write_bytes(data)
    return Response(content=data, media_type=ctype)
