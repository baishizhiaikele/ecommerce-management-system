from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db.session import get_db
from app.models.catalog import Category
from app.models.user import Role, User
from app.schemas.product import CategoryCreate, CategoryOut
from app.core.cache import cache_get, cache_set, cache_delete

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)) -> list[Category]:
    cached = await cache_get("categories:list")
    if cached is not None:
        return cached
    rows = await db.scalars(select(Category).order_by(Category.name))
    rows = list(rows)
    await cache_set("categories:list", [CategoryOut.model_validate(r).model_dump() for r in rows], ttl=300)
    return rows


@router.post("", response_model=CategoryOut, status_code=201)
async def create_category(
    data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(Role.ADMIN)),
) -> Category:
    if await db.scalar(select(Category).where(Category.slug == data.slug)):
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="分类 slug 已存在")
    category = Category(name=data.name, slug=data.slug, parent_id=data.parent_id)
    db.add(category)
    await db.commit()
    await db.refresh(category)
    await cache_delete("categories:list")
    return category
