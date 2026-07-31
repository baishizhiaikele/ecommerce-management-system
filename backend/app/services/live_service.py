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
        live_price = float(rp.live_price) if rp.live_price else None
        detail.products.append(
            LiveProductOut(
                id=product.id,
                name=product.name,
                price=float(product.price),
                image_url=product.image_url,
                stock=int(product.stock or 0),
                pinned=bool(rp.pinned),
                live_price=live_price,
                explaining=bool(rp.explaining),
                source="explaining" if rp.explaining else ("flash" if live_price else "normal"),
            )
        )
    # 讲解中的排最前，其次置顶，再次按 sort 升序
    detail.products.sort(
        key=lambda p: (0 if p.explaining else (1 if p.pinned else 2), 0)
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


# ---------------------------------------------------------------------------
# P1-4 直播下单闭环：挂车商品管理（改直播价 / 讲解标记 / 置顶）
# ---------------------------------------------------------------------------
async def upsert_product(
    db: AsyncSession,
    *,
    merchant: User,
    room_id: str,
    product_id: str,
    live_price: float | None = None,
    explaining: bool = False,
    pinned: bool = False,
) -> LiveProductOut:
    """挂车或更新某商品的直播专属信息（幂等：已挂则更新）。"""
    room = await db.get(LiveRoom, room_id)
    if not room or room.merchant_id != merchant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="直播间不存在")
    product = await db.get(Product, product_id)
    if not product or product.merchant_id != merchant.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="商品不存在或不属于你"
        )
    rp = await db.scalar(
        select(LiveRoomProduct).where(
            LiveRoomProduct.room_id == room_id, LiveRoomProduct.product_id == product_id
        )
    )
    if rp is None:
        rp = LiveRoomProduct(room_id=room_id, product_id=product_id)
        db.add(rp)
    if live_price is not None:
        rp.live_price = str(live_price)
    rp.explaining = 1 if explaining else 0
    rp.pinned = 1 if pinned else 0
    await db.commit()
    await db.refresh(rp)
    return LiveProductOut(
        id=product.id,
        name=product.name,
        price=float(product.price),
        image_url=product.image_url,
        stock=int(product.stock or 0),
        pinned=bool(rp.pinned),
        live_price=float(rp.live_price) if rp.live_price else None,
        explaining=bool(rp.explaining),
        source="explaining" if rp.explaining else ("flash" if rp.live_price else "normal"),
    )


async def remove_product(
    db: AsyncSession, *, merchant: User, room_id: str, product_id: str
) -> dict:
    room = await db.get(LiveRoom, room_id)
    if not room or room.merchant_id != merchant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="直播间不存在")
    rp = await db.scalar(
        select(LiveRoomProduct).where(
            LiveRoomProduct.room_id == room_id, LiveRoomProduct.product_id == product_id
        )
    )
    if rp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品未挂车")
    await db.delete(rp)
    await db.commit()
    return {"ok": True}


async def set_explaining(
    db: AsyncSession, *, merchant: User, room_id: str, product_id: str, explaining: bool
) -> dict:
    """切换某挂车商品是否正在讲解（同一时间仅一个为讲解中，体现主播话术节奏）。"""
    room = await db.get(LiveRoom, room_id)
    if not room or room.merchant_id != merchant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="直播间不存在")
    rp = await db.scalar(
        select(LiveRoomProduct).where(
            LiveRoomProduct.room_id == room_id, LiveRoomProduct.product_id == product_id
        )
    )
    if rp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品未挂车")
    if explaining:
        # 先清掉其他讲解中
        others = list(
            await db.scalars(
                select(LiveRoomProduct).where(
                    LiveRoomProduct.room_id == room_id, LiveRoomProduct.explaining == 1
                )
            )
        )
        for o in others:
            o.explaining = 0
    rp.explaining = 1 if explaining else 0
    await db.commit()
    return {"ok": True}
