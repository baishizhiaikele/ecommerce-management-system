"""P3-G 种草笔记 API：发布 / 浏览 / 点赞 / 删除，商品卡直连购买链路。"""
import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.note import NoteLike, ShoppingNote
from app.models.product import Product, ProductStatus
from app.models.user import Role, User

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=5000)
    images: list[str] = Field(default_factory=list, max_length=9)
    product_ids: list[str] = Field(default_factory=list, max_length=10)


async def _product_cards(db: AsyncSession, ids: list[str]) -> list[dict]:
    if not ids:
        return []
    products = list(
        await db.scalars(
            select(Product).where(Product.id.in_(ids), Product.status == ProductStatus.ACTIVE)
        )
    )
    order_map = {pid: idx for idx, pid in enumerate(ids)}
    products.sort(key=lambda p: order_map.get(p.id, 999))
    return [
        {
            "id": p.id,
            "name": p.name,
            "price": float(p.price),
            "image_url": p.image_url,
            "sales_count": p.sales_count,
        }
        for p in products
    ]


async def _serialize(db: AsyncSession, note: ShoppingNote, user_id: str | None = None) -> dict:
    author = await db.get(User, note.author_id)
    liked = False
    if user_id:
        liked = bool(
            await db.scalar(
                select(NoteLike.id).where(NoteLike.note_id == note.id, NoteLike.user_id == user_id)
            )
        )
    return {
        "id": note.id,
        "author_id": note.author_id,
        "author_name": author.username if author else "已注销",
        "title": note.title,
        "content": note.content,
        "images": json.loads(note.images or "[]"),
        "products": await _product_cards(db, json.loads(note.product_ids or "[]")),
        "likes_count": note.likes_count,
        "liked": liked,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_note(
    data: NoteIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    # 校验挂载商品存在且在售
    if data.product_ids:
        count = await db.scalar(
            select(func.count(Product.id)).where(
                Product.id.in_(data.product_ids), Product.status == ProductStatus.ACTIVE
            )
        )
        if count != len(set(data.product_ids)):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="存在无效或已下架的商品")
    note = ShoppingNote(
        author_id=user.id,
        title=data.title,
        content=data.content,
        images=json.dumps(data.images, ensure_ascii=False),
        product_ids=json.dumps(data.product_ids, ensure_ascii=False),
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return await _serialize(db, note, user.id)


@router.get("")
async def list_notes(
    keyword: str | None = None,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    stmt = select(ShoppingNote).order_by(ShoppingNote.created_at.desc())
    if keyword:
        kw = f"%{keyword}%"
        stmt = stmt.where(ShoppingNote.title.like(kw) | ShoppingNote.content.like(kw))
    notes = list(await db.scalars(stmt.limit(min(limit, 50)).offset(offset)))
    return [await _serialize(db, n, user.id) for n in notes]


@router.get("/{note_id}")
async def get_note(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    note = await db.get(ShoppingNote, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
    return await _serialize(db, note, user.id)


@router.post("/{note_id}/like")
async def toggle_like(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    note = await db.get(ShoppingNote, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
    existing = await db.scalar(
        select(NoteLike).where(NoteLike.note_id == note_id, NoteLike.user_id == user.id)
    )
    if existing:
        await db.delete(existing)
        note.likes_count = max(0, note.likes_count - 1)
        liked = False
    else:
        db.add(NoteLike(note_id=note_id, user_id=user.id))
        note.likes_count += 1
        liked = True
    await db.commit()
    return {"note_id": note_id, "liked": liked, "likes_count": note.likes_count}


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    note = await db.get(ShoppingNote, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
    if note.author_id != user.id and user.role != Role.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅作者或管理员可删除")
    await db.delete(note)
    await db.commit()
