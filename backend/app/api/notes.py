"""P3-G 种草笔记 API：发布 / 浏览 / 点赞 / 删除，商品卡直连购买链路。"""
import json

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.note import NoteLike, NoteReviewStatus, ShoppingNote
from app.models.product import Product, ProductStatus
from app.models.user import Role, User
from app.services import affiliate_service
from app.utils.time import iso_utc

router = APIRouter(prefix="/notes", tags=["notes"])

# 推荐流排序：点赞权重 + 近 7 天时间衰减（小时），无点赞的纯新笔记也能露出
_FEED_LIKE_WEIGHT = 10.0
_FEED_RECENCY_HOURS = 24.0 * 7.0


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


async def _serialize(
    db: AsyncSession,
    note: ShoppingNote,
    user_id: str | None = None,
    author_map: dict | None = None,
    liked_ids: set | None = None,
) -> dict:
    author = author_map.get(note.author_id) if author_map is not None else await db.get(User, note.author_id)
    if liked_ids is not None:
        liked = note.id in liked_ids
    elif user_id:
        liked = bool(
            await db.scalar(
                select(NoteLike.id).where(NoteLike.note_id == note.id, NoteLike.user_id == user_id)
            )
        )
    else:
        liked = False
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
        "review_status": note.review_status.value,
        "reject_reason": note.reject_reason,
        "reviewed_at": iso_utc(note.reviewed_at) if note.reviewed_at else None,
        "created_at": iso_utc(note.created_at),
        "affiliate_code": note.affiliate_code,
        "share_url": (
            f"{settings.FRONTEND_BASE_URL.rstrip('/')}/note/{note.id}?ref={note.affiliate_code}"
            if note.affiliate_code
            else None
        ),
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
        review_status=NoteReviewStatus.PENDING,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return await _serialize(db, note, user.id)


@router.get("")
async def list_notes(
    keyword: str | None = None,
    status: NoteReviewStatus | None = None,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    # 公开流：非管理员仅可见已审核通过的笔记；管理员可指定 status 查看全部（含待审/驳回）
    stmt = select(ShoppingNote).order_by(ShoppingNote.created_at.desc())
    if user.role != Role.ADMIN:
        stmt = stmt.where(ShoppingNote.review_status == NoteReviewStatus.APPROVED)
    elif status is not None:
        stmt = stmt.where(ShoppingNote.review_status == status)
    if keyword:
        kw = f"%{keyword}%"
        stmt = stmt.where(ShoppingNote.title.like(kw) | ShoppingNote.content.like(kw))
    notes = list(await db.scalars(stmt.limit(min(limit, 50)).offset(offset)))
    # 批量预取作者与当前用户点赞状态，避免每条笔记各查 2 次（N+1 → 批量）
    author_ids = [n.author_id for n in notes]
    author_map = (
        {u.id: u for u in await db.scalars(select(User).where(User.id.in_(author_ids)))}
        if author_ids
        else {}
    )
    liked_ids: set = set()
    if user and notes:
        liked_ids = set(
            await db.scalars(
                select(NoteLike.note_id).where(
                    NoteLike.note_id.in_([n.id for n in notes]), NoteLike.user_id == user.id
                )
            )
        )
    return [await _serialize(db, n, user.id, author_map, liked_ids) for n in notes]


@router.get("/feed")
async def note_feed(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """种草推荐流：仅对已审核通过的笔记，按「热度+新近」综合排序。
    商业化闭环的入口——每篇笔记若已绑定分销码，卡片即带作者推广链接。"""
    now = datetime.now(timezone.utc)
    stmt = (
        select(ShoppingNote)
        .where(ShoppingNote.review_status == NoteReviewStatus.APPROVED)
        .order_by(ShoppingNote.created_at.desc())
        .limit(200)  # 候选池，内存内做综合排序
    )
    candidates = list(await db.scalars(stmt))
    scored = []
    for n in candidates:
        # SQLite 存的是 naive 时间，统一按 naive 处理避免 tz 混算
        created = n.created_at.replace(tzinfo=None) if n.created_at.tzinfo else n.created_at
        age_hours = max(0.0, (now.replace(tzinfo=None) - created).total_seconds() / 3600.0)
        score = n.likes_count * _FEED_LIKE_WEIGHT + max(0.0, _FEED_RECENCY_HOURS - age_hours)
        scored.append((score, n))
    scored.sort(key=lambda x: x[0], reverse=True)
    page = scored[offset : offset + min(limit, 50)]
    notes = [n for _, n in page]
    author_ids = [n.author_id for n in notes]
    author_map = (
        {u.id: u for u in await db.scalars(select(User).where(User.id.in_(author_ids)))}
        if author_ids
        else {}
    )
    return [await _serialize(db, n, user.id, author_map) for n in notes]


@router.get("/for-product/{product_id}")
async def notes_for_product(
    product_id: str,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """商品反查种草（商品详情页「大家都在种草」社交背书）。
    返回挂载了该商品且已审核通过的笔记。"""
    stmt = (
        select(ShoppingNote)
        .where(
            ShoppingNote.review_status == NoteReviewStatus.APPROVED,
            ShoppingNote.product_ids.like(f'%"{product_id}"%'),
        )
        .order_by(ShoppingNote.likes_count.desc(), ShoppingNote.created_at.desc())
        .limit(min(limit, 50))
    )
    notes = list(await db.scalars(stmt))
    author_ids = [n.author_id for n in notes]
    author_map = (
        {u.id: u for u in await db.scalars(select(User).where(User.id.in_(author_ids)))}
        if author_ids
        else {}
    )
    return [await _serialize(db, n, user.id, author_map) for n in notes]


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


class NoteReviewIn(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")  # 仅允许明确动作，避免注入
    reason: str | None = Field(default=None, max_length=255)


@router.post("/{note_id}/review", status_code=status.HTTP_200_OK)
async def review_note(
    note_id: str,
    data: NoteReviewIn,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(Role.ADMIN)),
) -> dict:
    """管理员审核笔记：approve 公开 / reject 下架（需原因）。审核闭环关键节点。"""
    note = await db.get(ShoppingNote, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
    if data.action == "approve":
        note.review_status = NoteReviewStatus.APPROVED
        note.reject_reason = None
    else:
        if not data.reason:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="驳回需填写原因")
        note.review_status = NoteReviewStatus.REJECTED
        note.reject_reason = data.reason
    note.reviewed_at = datetime.now(timezone.utc)
    note.reviewed_by = admin.id
    await db.commit()
    await db.refresh(note)
    return await _serialize(db, note, admin.id)


@router.post("/{note_id}/attach-affiliate", status_code=status.HTTP_200_OK)
async def attach_affiliate(
    note_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """商业化闭环：作者将笔记与其分销推广绑定。
    若笔记挂载了商品，则自动为作者生成（或复用）该商品的推广码，并写入笔记；
    后续笔记卡片的「立即购买」与分享链接都携带此码，点击/下单均归因到作者佣金。"""
    note = await db.get(ShoppingNote, note_id)
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="笔记不存在")
    if note.author_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅作者可绑定推广")
    product_ids = json.loads(note.product_ids or "[]")
    if not product_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="笔记未挂载商品，无法生成推广链接")
    if note.affiliate_code:
        return await _serialize(db, note, user.id)
    link = await affiliate_service.get_or_create_link(db, user_id=user.id, product_id=product_ids[0])
    note.affiliate_code = link.code
    await db.commit()
    await db.refresh(note)
    return await _serialize(db, note, user.id)


@router.get("/admin/queue")
async def review_queue(
    status_filter: NoteReviewStatus | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(Role.ADMIN)),
) -> list[dict]:
    """审核队列：管理员查看待审/全部笔记（默认按待审优先）。"""
    stmt = select(ShoppingNote).order_by(ShoppingNote.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(ShoppingNote.review_status == status_filter)
    else:
        # 默认优先展示待审
        stmt = stmt.where(ShoppingNote.review_status != NoteReviewStatus.APPROVED)
    notes = list(await db.scalars(stmt.limit(min(limit, 100)).offset(offset)))
    author_ids = [n.author_id for n in notes]
    author_map = (
        {u.id: u for u in await db.scalars(select(User).where(User.id.in_(author_ids)))}
        if author_ids
        else {}
    )
    return [await _serialize(db, n, admin.id, author_map) for n in notes]
