from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import search_service
from app.core.cache import cache_get, cache_set

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/hot", response_model=list[str])
async def hot_keywords(
    limit: int = Query(10, ge=1, le=50), db: AsyncSession = Depends(get_db)
) -> list[str]:
    cached = await cache_get(f"search:hot:{limit}")
    if cached is not None:
        return cached
    result = await search_service.top_keywords(db, limit=limit)
    await cache_set(f"search:hot:{limit}", result, ttl=120)
    return result


@router.post("/record")
async def record_keyword(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)) -> dict:
    await search_service.record_keyword(db, q)
    return {"ok": True}


@router.post("/qa")
async def search_qa(
    question: str = Query(..., min_length=1, description="自然语言搜索问题"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """AI 智能搜索问答：自然语言 → 解析筛选 → 召回商品并生成回答。"""
    return await search_service.search_qa(db, question, user_id=user.id)


@router.get("/facets")
async def product_facets(
    db: AsyncSession = Depends(get_db),
    keyword: str = Query(None),
    category_id: str = Query(None),
    min_price: float = Query(None, ge=0),
    max_price: float = Query(None, ge=0),
):
    """分面检索数据（P1-6）：类目计数 / 价格区间 / 评分分桶 / 排序选项。"""
    return await search_service.facets(
        db, keyword=keyword, category_id=category_id, min_price=min_price, max_price=max_price
    )


@router.get("/suggest", response_model=list[str])
async def suggest(
    q: str = Query(..., min_length=1, max_length=50),
    db: AsyncSession = Depends(get_db),
):
    """搜索联想（P1-7）：热门关键词前缀匹配 + 商品名包含匹配。"""
    return await search_service.suggest(db, q)


# ---------------------------------------------------------------------------
# P1-1 图搜：以图搜商品
# ---------------------------------------------------------------------------
from fastapi import UploadFile, File
from app.schemas.product import ProductOut
from app.services import vision_service as _vision


@router.post("/by-image", response_model=list[ProductOut])
async def search_by_image(
    file: UploadFile = File(..., description="上传图片，按相似度召回商品"),
    limit: int = Query(12, ge=1, le=48),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProductOut]:
    """以图搜图（P1-1）：上传图片 → 计算感知哈希 → 按汉明距离召回相似商品。

    无外部密钥依赖（无 key 降级路径）；配置 VISION_API_KEY 后可升级为向量语义检索。
    """
    if not (file.content_type or "").startswith("image/"):
        from fastapi import HTTPException, status as _st

        raise HTTPException(status_code=_st.HTTP_400_BAD_REQUEST, detail="请上传图片文件")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        from fastapi import HTTPException, status as _st

        raise HTTPException(status_code=_st.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="图片过大（<=8MB）")
    products = await _vision.search_by_image(db, data, limit=limit)
    return [ProductOut.model_validate(p) for p in products]
