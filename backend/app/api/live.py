"""直播带货接口。"""
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.core.security import decode_token
from app.core.ws import manager
from app.db.session import SessionLocal, get_db
from app.models.user import Role, User
from app.schemas.live import (
    LiveMessageCreate,
    LiveMessageOut,
    LiveRoomCreate,
    LiveRoomDetail,
    LiveRoomOut,
)
from app.services import live_service

router = APIRouter(prefix="/live", tags=["live"])


@router.get("", response_model=list[LiveRoomOut])
async def list_rooms(db: AsyncSession = Depends(get_db)):
    return await live_service.list_rooms(db)


@router.post("", response_model=LiveRoomOut, status_code=201)
async def create_room(
    body: LiveRoomCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
):
    return await live_service.create_room(
        db, merchant=user, title=body.title, cover_url=body.cover_url, product_ids=body.product_ids
    )


@router.get("/mine", response_model=list[LiveRoomOut])
async def my_rooms(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
):
    return await live_service.list_rooms(db, merchant_id=user.id)


@router.get("/{room_id}", response_model=LiveRoomDetail)
async def room_detail(room_id: str, db: AsyncSession = Depends(get_db)):
    return await live_service.room_detail(db, room_id)


@router.post("/{room_id}/start", response_model=LiveRoomOut)
async def start_room(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
):
    return await live_service.set_status(db, merchant=user, room_id=room_id, action="start")


@router.post("/{room_id}/end", response_model=LiveRoomOut)
async def end_room(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
):
    return await live_service.set_status(db, merchant=user, room_id=room_id, action="end")


@router.post("/{room_id}/enter")
async def enter_room(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return await live_service.enter_room(db, room_id)


@router.get("/{room_id}/messages", response_model=list[LiveMessageOut])
async def list_messages(
    room_id: str, after_id: str | None = None, db: AsyncSession = Depends(get_db)
):
    return await live_service.list_messages(db, room_id, after_id=after_id)


@router.post("/{room_id}/messages", response_model=LiveMessageOut, status_code=201)
async def post_message(
    room_id: str,
    body: LiveMessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await live_service.post_message(db, room_id=room_id, user=user, content=body.content)


@router.websocket("/{room_id}/ws")
async def live_ws(websocket: WebSocket, room_id: str):
    """直播间弹幕 WebSocket：实时收发，替代前端 3 秒轮询。"""
    token = websocket.cookies.get("access_token") or websocket.query_params.get("token")
    user = None
    if token:
        try:
            payload = decode_token(token)
            uid = payload.get("sub")
            if uid:
                async with SessionLocal() as db:
                    user = await db.scalar(select(User).where(User.id == uid))
        except Exception:  # noqa: BLE001
            user = None
    await manager.connect_room(room_id, websocket)
    try:
        async with SessionLocal() as db:
            while True:
                data = await websocket.receive_json()
                content = (data.get("content") or "").strip()
                if not content:
                    continue
                if not user:
                    await websocket.send_json({"type": "error", "detail": "unauthorized"})
                    continue
                msg = await live_service.post_message(
                    db, room_id=room_id, user=user, content=content
                )
                await manager.broadcast_room(
                    room_id, LiveMessageOut.model_validate(msg).model_dump()
                )
    except WebSocketDisconnect:
        manager.disconnect_room(room_id, websocket)
