"""P3-E 商家店铺可视化装修 API。"""
import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db.session import get_db
from app.models.decoration import ShopDecoration
from app.models.product import Product, ProductStatus
from app.models.user import Role, User
from app.schemas.product import ProductOut

router = APIRouter(prefix="/decoration", tags=["decoration"])

ALLOWED_MODULE_TYPES = {"banner", "notice", "products"}
DEFAULT_LAYOUT = [{"type": "banner"}, {"type": "products", "title": "全部商品", "product_ids": []}]


class DecorationIn(BaseModel):
    theme_color: str = Field(default="#1677ff", pattern=r"^#[0-9a-fA-F]{6}$")
    banner_image: str | None = Field(default=None, max_length=500)
    banner_title: str | None = Field(default=None, max_length=100)
    banner_subtitle: str | None = Field(default=None, max_length=200)
    layout: list[dict] = Field(default_factory=lambda: list(DEFAULT_LAYOUT))


def _serialize(deco: ShopDecoration | None, merchant_id: str) -> dict:
    if not deco:
        return {
            "merchant_id": merchant_id,
            "theme_color": "#1677ff",
            "banner_image": None,
            "banner_title": None,
            "banner_subtitle": None,
            "layout": list(DEFAULT_LAYOUT),
        }
    return {
        "merchant_id": deco.merchant_id,
        "theme_color": deco.theme_color,
        "banner_image": deco.banner_image,
        "banner_title": deco.banner_title,
        "banner_subtitle": deco.banner_subtitle,
        "layout": json.loads(deco.layout) if deco.layout else list(DEFAULT_LAYOUT),
    }


@router.get("/mine")
async def my_decoration(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> dict:
    deco = await db.scalar(select(ShopDecoration).where(ShopDecoration.merchant_id == user.id))
    return _serialize(deco, user.id)


@router.put("/mine")
async def save_decoration(
    data: DecorationIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> dict:
    # 校验模块类型合法
    for mod in data.layout:
        if mod.get("type") not in ALLOWED_MODULE_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不支持的模块类型: {mod.get('type')}",
            )
    # 安全修复（P1#4）：products 模块引用的商品必须属于当前商家，
    # 防止商家把他人商品挂进自己店铺页。过滤掉非本商家的商品 id。
    for mod in data.layout:
        if mod.get("type") != "products":
            continue
        ids = [str(i) for i in (mod.get("product_ids") or [])]
        if not ids:
            continue
        owned = set(
            await db.scalars(
                select(Product.id).where(
                    Product.id.in_(ids), Product.merchant_id == user.id
                )
            )
        )
        mod["product_ids"] = [pid for pid in ids if pid in owned]
    deco = await db.scalar(select(ShopDecoration).where(ShopDecoration.merchant_id == user.id))
    if not deco:
        deco = ShopDecoration(merchant_id=user.id)
        db.add(deco)
    deco.theme_color = data.theme_color
    deco.banner_image = data.banner_image
    deco.banner_title = data.banner_title
    deco.banner_subtitle = data.banner_subtitle
    deco.layout = json.dumps(data.layout, ensure_ascii=False)
    await db.commit()
    await db.refresh(deco)
    return _serialize(deco, user.id)


@router.get("/{merchant_id}")
async def shop_decoration(merchant_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    """买家店铺页读取装修配置（含 products 模块的商品数据填充）。"""
    m = await db.get(User, merchant_id)
    if not m or m.role != Role.MERCHANT:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="店铺不存在")
    deco = await db.scalar(select(ShopDecoration).where(ShopDecoration.merchant_id == merchant_id))
    result = _serialize(deco, merchant_id)
    # 填充商品模块数据
    for mod in result["layout"]:
        if mod.get("type") != "products":
            continue
        ids = [str(i) for i in (mod.get("product_ids") or [])]
        stmt = select(Product).where(
            Product.merchant_id == merchant_id, Product.status == ProductStatus.ACTIVE
        )
        if ids:
            stmt = stmt.where(Product.id.in_(ids))
        products = list(await db.scalars(stmt.order_by(Product.created_at.desc()).limit(60)))
        if ids:  # 保持商家配置顺序
            order_map = {pid: idx for idx, pid in enumerate(ids)}
            products.sort(key=lambda p: order_map.get(p.id, 999))
        mod["products"] = [ProductOut.model_validate(p).model_dump(mode="json") for p in products]
    return result
