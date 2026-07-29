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

# 图片内容在后端已落盘缓存，且演示图床地址稳定，
# 让浏览器长期缓存以减少重复请求（缓解页面卡顿）。
CACHE_HEADERS = {
    "Cache-Control": "public, max-age=86400, immutable",
}

# 上游图床不可达（如 Wikimedia 拒绝/限流）时返回的占位图，
# 避免前端出现破图与满屏 502，保证界面优雅降级。
PLACEHOLDER_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">'
    '<rect width="100%" height="100%" fill="#e9edf2"/>'
    '<text x="50%" y="50%" font-size="18" fill="#9aa5b1" '
    'text-anchor="middle" dominant-baseline="middle">图片暂不可用</text></svg>'
)


def _placeholder_response() -> Response:
    return Response(content=PLACEHOLDER_SVG, media_type="image/svg+xml", headers=CACHE_HEADERS)



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
            headers=CACHE_HEADERS,
        )

    try:
        # 部分图床（如 Wikimedia）会拒绝缺少 User-Agent 的默认请求（返回 403），
        # 导致代理误报 502。显式带上浏览器 UA 以正常拉取图片。
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        async with httpx.AsyncClient(timeout=10, follow_redirects=True, headers=headers) as client:
            async with client.stream("GET", u) as resp:
                if resp.status_code != 200:
                    return _placeholder_response()
                data = b""
                async for chunk in resp.aiter_bytes():
                    data += chunk
                    if len(data) > MAX_BYTES:
                        return _placeholder_response()
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001
        return _placeholder_response()

    ctype = resp.headers.get("content-type") or mimetypes.guess_type(u)[0] or "image/jpeg"
    cached.write_bytes(data)
    return Response(content=data, media_type=ctype, headers=CACHE_HEADERS)
