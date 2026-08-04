"""图搜（P1-1）。

设计目标：不依赖外部密钥即可工作（无 key 降级），接入 key 后可升级语义向量检索。

- **pHash（感知哈希）**：纯算法，对图像灰度化→缩放到 8x8→二值化→生成 64 位串。
  相似图（同源/裁剪/轻微滤镜）的 pHash 汉明距离很小，可用作"以图搜图"的近似召回。
- **向量语义检索（预留）**：配置 ``VISION_API_KEY`` 后，可将上传图/商品图编码为向量存入
  ``ImageFeature.embedding``，搜索时按余弦相似度排序（更鲁棒，跨类目也能召回）。

对外 API：
- ``compute_phash(image_bytes) -> str | None``：计算图片感知哈希。
- ``search_by_image(db, image_bytes, limit) -> list[Product]``：上传图 → pHash → 按汉明距离召回相似商品。
- ``build_image_feature(db, product) -> None``：为商品主图（本地或远程 URL）计算并存储 pHash。
"""
from __future__ import annotations

import io
import logging

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.models.product import Product, ProductStatus
from app.models.search import ImageFeature

logger = logging.getLogger("vision")

_HASH_SIZE = 8  # pHash 维度 8x8 -> 64 位


def compute_phash(image_bytes: bytes) -> str | None:
    """计算图片感知哈希（64 位十六进制串），失败返回 None。"""
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert("L").resize((_HASH_SIZE, _HASH_SIZE), Image.LANCZOS)
        px = list(img.getdata())
    except Exception as exc:  # noqa: BLE001
        logger.warning("图搜：图片解码失败 %s", exc)
        return None
    # 二值化：中位数阈值
    median = sorted(px)[len(px) // 2]
    bits = [1 if v >= median else 0 for v in px]
    # 打包为十六进制串
    hex_str = ""
    for i in range(0, 64, 4):
        nibble = bits[i] << 3 | bits[i + 1] << 2 | bits[i + 2] << 1 | bits[i + 3]
        hex_str += f"{nibble:x}"
    return hex_str


_MAX_HAMMING = 999  # 汉明距离在输入无效时返回的最大值（表示不匹配）


def _hamming(a: str | None, b: str | None) -> int:
    """汉明距离（两位串异或的 1 的个数）。"""
    if not a or not b or len(a) != len(b):
        return _MAX_HAMMING
    diff = 0
    for ca, cb in zip(a, b):
        if ca != cb:
            diff += 1
    return diff


async def search_by_image(db, image_bytes: bytes, *, limit: int = 12) -> list[Product]:
    """以图搜图：计算上传图 pHash，按汉明距离召回相似商品（无 key 降级路径）。"""
    query_hash = compute_phash(image_bytes)
    if not query_hash:
        return []
    rows = (await db.scalars(select(ImageFeature).where(ImageFeature.phash.isnot(None)))).all()
    if not rows:
        return []
    scored = []
    for feat in rows:
        d = _hamming(query_hash, feat.phash)
        if d <= 12:  # 相似阈值：距离越小越相似
            scored.append((d, feat.product_id))
    scored.sort(key=lambda x: x[0])
    pids = [pid for _, pid in scored[:limit]]
    if not pids:
        return []
    products = (await db.scalars(
        select(Product).where(Product.id.in_(pids), Product.status == ProductStatus.ACTIVE)
    )).all()
    # 按相似度排序返回
    by_pid = {p.id: p for p in products}
    return [by_pid[pid] for pid in pids if pid in by_pid]


async def build_image_feature(db, product: Product) -> None:
    """为商品主图计算并存储 pHash（创建/更新商品时调用，幂等）。"""
    url = product.image_url
    if not url:
        return
    try:
        if url.startswith("http://") or url.startswith("https://"):
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.content
        else:
            # 本地/代理路径：当前项目商品图以 http(s) URL 为主，本地路径暂不计算
            return
        h = compute_phash(data)
        if not h:
            return
        existing = await db.scalar(
            select(ImageFeature).where(ImageFeature.product_id == product.id)
        )
        if existing:
            existing.phash = h
        else:
            db.add(ImageFeature(product_id=product.id, phash=h))
        await db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("图搜：商品 %s 特征构建失败 %s", product.id, exc)
