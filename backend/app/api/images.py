"""图片本地代理 + 离线商品占位图。

提供的端点：
- /api/images/proxy?u=<外链 URL>  代理白名单外部图床（picsum/Wikimedia/loremflickr/unsplash），
  首次拉取后写入本地缓存，后续直接返回本地副本，避免外网波动 + CORS + 跨协议问题。
- /api/images/seed?label=<商品名>&w=<宽>[&h=<高>]  用 Pillow 渲染 600x600 商品占位 PNG。
  纯本地生成，离线可用，中文永远能正常显示（使用系统中文字体）。

为什么改用 PNG 而非 SVG：
之前 `/seed` 返回的 SVG 在部分浏览器（Chrome 内核渲染中文 `<text>` 时若系统未配置合适的中文
fallback 字体）会出现"色块但看不到商品名"的问题。改用 Pillow 直接光栅化、用系统 msyh.ttc
（Windows）/ Noto Sans CJK（Linux）画中文，能保证文字始终清晰可见。
"""
import hashlib
import mimetypes
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Path as ApiPath, Query, Response

from app.core.config import settings

router = APIRouter(prefix="/images", tags=["images"])


# --- AI 商品图真实图床：对外提供本地 / 对象存储挂载目录中的商品图 ---
_BED_DIR = Path(settings.IMAGE_BED_DIR)


@router.get("/bed/{filename}")
async def bed_image(filename: str = ApiPath(..., description="图床文件名")) -> Response:
    """返回 AI 生成后落盘到图床的商品图（稳定 URL，离线可用）。"""
    # 防目录穿越：仅允许文件名本体
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="非法文件名")
    _BED_DIR.mkdir(parents=True, exist_ok=True)
    path = _BED_DIR / filename
    if not path.exists():
        return _placeholder_response()
    return Response(
        content=path.read_bytes(),
        media_type=mimetypes.guess_type(filename)[0] or "image/png",
        headers=CACHE_HEADERS,
    )

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

# 外部代理图也长期缓存，缓解页面卡顿
CACHE_HEADERS = {
    "Cache-Control": "public, max-age=86400, immutable",
}

# 上游图床不可达（如 Wikimedia 拒绝/限流）时返回的占位图
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


# ---------------------------------------------------------------------------
# 离线商品占位图（Pillow 渲染 PNG，中文稳定可见）
# ---------------------------------------------------------------------------

# 中文字体候选路径，跨平台覆盖 Windows / 常见 Linux 发行版。
# 找不到时降级为 Pillow 默认位图字体（中文会变成方框，但仍能渲染）。
FONT_CANDIDATES = (
    # Windows
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
    # Noto CJK（Linux 常见）
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
    # 文泉驿（部分容器镜像）
    "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
    "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
    # macOS（少数部署场景）
    "/System/Library/Fonts/PingFang.ttc",
    "/Library/Fonts/Songti.ttc",
)

_CACHED_FONT: Optional[dict] = None  # {"path": str, "index": int}


def _resolve_font() -> Optional[dict]:
    """探测系统中文字体路径，缓存结果。"""
    global _CACHED_FONT
    if _CACHED_FONT is not None:
        return _CACHED_FONT
    candidates = FONT_CANDIDATES
    # 配置了 FONT_PATH 时优先使用（覆盖默认候选列表）
    if settings.FONT_PATH:
        candidates = (settings.FONT_PATH, *FONT_CANDIDATES)
    for p in candidates:
        if Path(p).exists():
            _CACHED_FONT = {"path": p, "index": 0}
            return _CACHED_FONT
    _CACHED_FONT = None
    return None


def _load_font(size: int):
    """加载中文字体；找不到时回退到 Pillow 默认字体。"""
    info = _resolve_font()
    if info:
        try:
            from PIL import ImageFont

            return ImageFont.truetype(info["path"], size=size, index=info["index"])
        except Exception:  # noqa: BLE001
            pass
    from PIL import ImageFont

    return ImageFont.load_default()


def _hsl_to_rgb(h: float, s: float, l: float) -> tuple[int, int, int]:
    """HSL(0-360, 0-100, 0-100) -> RGB(0-255)。"""
    s /= 100.0
    l /= 100.0
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs(((h / 60.0) % 2) - 1))
    m = l - c / 2
    if h < 60:
        rp, gp, bp = c, x, 0
    elif h < 120:
        rp, gp, bp = x, c, 0
    elif h < 180:
        rp, gp, bp = 0, c, x
    elif h < 240:
        rp, gp, bp = 0, x, c
    elif h < 300:
        rp, gp, bp = x, 0, c
    else:
        rp, gp, bp = c, 0, x
    return int((rp + m) * 255), int((gp + m) * 255), int((bp + m) * 255)


@router.get("/seed")
async def seed_image(
    label: str = Query("", description="图上显示的文字（如商品名）"),
    name: str = Query("", description="label 的别名（兼容旧种子 URL 的 name= 参数）"),
    w: int = Query(600, ge=64, le=1200),
    size: int = Query(0, ge=0, le=1200, description="w 的别名（兼容旧种子 URL 的 size= 参数）"),
    h: int = Query(0, ge=0, le=1200),
) -> Response:
    """用 Pillow 生成本地商品占位 PNG：渐变背景 + 商品名（白字黑描边）。

    设计要点：
    - 完全离线，不依赖任何外部图床/字体下载；
    - 中文稳定渲染（走系统 msyh / Noto CJK 等真实字体）；
    - 同 label + 同尺寸下结果像素级一致，便于前端缓存。
    - 兼容历史参数名：name 作为 label 的别名，size 作为 w 的别名。
    """
    from PIL import Image, ImageDraw

    text = (label or name or "商品").strip() or "商品"
    w = w or size or 600
    hh = h or w
    # 按 label 稳定取色，避免每次刷新都换色
    hsh = int(hashlib.md5(text.encode("utf-8")).hexdigest(), 16)
    hue1 = hsh % 360
    hue2 = (hue1 + 35) % 360
    c1 = _hsl_to_rgb(hue1, 62, 60)
    c2 = _hsl_to_rgb(hue2, 58, 46)

    # 自适应字号：字数越多字号越小，保证一行内不溢出；上下限 28~64
    font_size = max(28, min(int(w / max(len(text), 1)) * 1.8, 64))
    font = _load_font(font_size)

    img = Image.new("RGB", (w, hh), c1)
    draw = ImageDraw.Draw(img)
    # 对角渐变（左上 -> 右下）
    for y in range(hh):
        t = y / max(hh - 1, 1)
        r = int(c1[0] * (1 - t) + c2[0] * t)
        g = int(c1[1] * (1 - t) + c2[1] * t)
        b = int(c1[2] * (1 - t) + c2[2] * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

    # 居中绘制（用 textbbox 计算实际宽高，处理中文 ascent/descent）
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (w - tw) / 2 - bbox[0]
    ty = (hh - th) / 2 - bbox[1]

    # 8 方向描边（黑色半透明），保证浅色背景下文字也清晰
    stroke_offsets = [(-2, -2), (-2, 0), (-2, 2), (0, -2), (0, 2), (2, -2), (2, 0), (2, 2)]
    for dx, dy in stroke_offsets:
        draw.text((tx + dx, ty + dy), text, font=font, fill=(0, 0, 0, 180))
    draw.text((tx, ty), text, font=font, fill=(255, 255, 255, 245))

    import io

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400, immutable"},
    )


# ---------------------------------------------------------------------------
# 本地 AI 生成商品图（离线、与商品一一对应、无随机性、无水印/文字）
# 图片由 image_gen 工具预生成到 backend/product_images/<商品名>.jpg，
# 这里按商品名静态返回，dev / prod 同源均可直接访问。
# ---------------------------------------------------------------------------
PRODUCT_IMG_DIR = Path(__file__).resolve().parents[2] / "product_images"
PRODUCT_CACHE_HEADERS = {"Cache-Control": "public, max-age=86400, immutable"}


@router.get("/product/{name}")
async def product_image(name: str) -> Response:
    """返回本地 AI 生成的商品图 backend/product_images/<name>.jpg。

    离线、稳定、与商品名一一对应；无需任何外部图床或随机匹配。
    """
    # 路径遍历防护：仅取最后一段，剥离任何目录分隔符
    safe = name.replace("\\", "/").split("/")[-1]
    candidate = PRODUCT_IMG_DIR / f"{safe}.jpg"
    if not candidate.is_file():
        return _placeholder_response()
    return Response(
        content=candidate.read_bytes(),
        media_type="image/jpeg",
        headers=PRODUCT_CACHE_HEADERS,
    )