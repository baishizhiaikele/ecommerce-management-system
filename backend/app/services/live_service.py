"""直播带货业务：直播间管理、弹幕、商品讲解列表。"""
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.live import LiveMessage, LiveRoom, LiveRoomProduct, LiveStatus
from app.models.product import Product, ProductStatus
from app.models.user import User
from app.schemas.live import LiveMessageOut, LiveProductOut, LiveRoomDetail, LiveRoomOut


async def _room_out(db: AsyncSession, room: LiveRoom) -> LiveRoomOut:
    out = LiveRoomOut.model_validate(room)
    merchant = await db.get(User, room.merchant_id)
    out.merchant_name = merchant.username if merchant else None
    out.product_count = int(
        await db.scalar(
            select(func.count(LiveRoomProduct.id)).where(LiveRoomProduct.room_id == room.id)
        )
        or 0
    )
    return out


async def create_room(
    db: AsyncSession, *, merchant: User, title: str, cover_url: str | None, product_ids: list[str]
) -> LiveRoomOut:
    room = LiveRoom(merchant_id=merchant.id, title=title, cover_url=cover_url)
    db.add(room)
    await db.flush()
    for pid in dict.fromkeys(product_ids):
        product = await db.get(Product, pid)
        if not product or product.merchant_id != merchant.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="商品不存在或不属于你"
            )
        db.add(LiveRoomProduct(room_id=room.id, product_id=pid))
    await db.commit()
    await db.refresh(room)
    return await _room_out(db, room)


async def set_status(
    db: AsyncSession, *, merchant: User, room_id: str, action: str
) -> LiveRoomOut:
    room = await db.get(LiveRoom, room_id)
    if not room or room.merchant_id != merchant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="直播间不存在")
    now = datetime.now(timezone.utc)
    if action == "start":
        if room.status == LiveStatus.ENDED:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="直播已结束")
        room.status = LiveStatus.LIVE
        room.started_at = now
    elif action == "end":
        room.status = LiveStatus.ENDED
        room.ended_at = now
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="非法操作")
    await db.commit()
    await db.refresh(room)
    return await _room_out(db, room)


async def list_rooms(db: AsyncSession, *, merchant_id: str | None = None) -> list[LiveRoomOut]:
    stmt = select(LiveRoom).order_by(LiveRoom.created_at.desc())
    if merchant_id:
        stmt = stmt.where(LiveRoom.merchant_id == merchant_id)
    else:
        stmt = stmt.where(LiveRoom.status != LiveStatus.ENDED)
    rooms = list(await db.scalars(stmt))
    # 直播中的排前面
    rooms.sort(key=lambda r: 0 if r.status == LiveStatus.LIVE else 1)
    return [await _room_out(db, r) for r in rooms]


async def room_detail(db: AsyncSession, room_id: str) -> LiveRoomDetail:
    room = await db.get(LiveRoom, room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="直播间不存在")
    base = await _room_out(db, room)
    detail = LiveRoomDetail(**base.model_dump())
    rows = await db.execute(
        select(LiveRoomProduct, Product)
        .join(Product, Product.id == LiveRoomProduct.product_id)
        .where(LiveRoomProduct.room_id == room_id)
    )
    for rp, product in rows.all():
        if product.status != ProductStatus.ACTIVE:
            continue
        detail.products.append(
            LiveProductOut(
                id=product.id,
                name=product.name,
                price=float(product.price),
                image_url=product.image_url,
                stock=int(product.stock or 0),
                pinned=bool(rp.pinned),
            )
        )
    return detail


async def enter_room(db: AsyncSession, room_id: str) -> dict:
    room = await db.get(LiveRoom, room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="直播间不存在")
    room.viewers = (room.viewers or 0) + 1
    await db.commit()
    return {"viewers": room.viewers}


async def post_message(
    db: AsyncSession, *, room_id: str, user: User, content: str
) -> LiveMessageOut:
    room = await db.get(LiveRoom, room_id)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="直播间不存在")
    if room.status != LiveStatus.LIVE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="直播未开始或已结束")
    msg = LiveMessage(room_id=room_id, user_id=user.id, username=user.username, content=content)
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return LiveMessageOut.model_validate(msg)


async def list_messages(
    db: AsyncSession, room_id: str, after_id: str | None = None, limit: int = 50
) -> list[LiveMessageOut]:
    stmt = (
        select(LiveMessage)
        .where(LiveMessage.room_id == room_id)
        .order_by(LiveMessage.created_at.desc())
        .limit(limit)
    )
    rows = list(await db.scalars(stmt))
    rows.reverse()
    if after_id:
        ids = [m.id for m in rows]
        if after_id in ids:
            rows = rows[ids.index(after_id) + 1 :]
    return [LiveMessageOut.model_validate(m) for m in rows]
