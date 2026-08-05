"""直播带货接口。"""
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.core.security import decode_token
from app.core.ws import manager
from app.db.session import SessionLocal, get_db
from app.models.live import LiveRoom
from app.models.user import Role, User
from app.schemas.live import (
    LiveMessageCreate,
    LiveMessageOut,
    LiveProductOut,
    LiveRoomCreate,
    LiveRoomDetail,
    LiveRoomOut,
)
from app.services import live_service
from app.services.ai_service import ai_service

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


# ---------------------------------------------------------------------------
# P1-4 直播下单闭环：挂车商品管理（商家端）
# ---------------------------------------------------------------------------
class LiveProductUpsert(BaseModel):
    live_price: float | None = None
    explaining: bool = False
    pinned: bool = False


@router.post("/{room_id}/products", response_model=LiveProductOut)
async def upsert_room_product(
    room_id: str,
    product_id: str,
    body: LiveProductUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
):
    return await live_service.upsert_product(
        db, merchant=user, room_id=room_id, product_id=product_id,
        live_price=body.live_price, explaining=body.explaining, pinned=body.pinned,
    )


@router.delete("/{room_id}/products/{product_id}", response_model=dict)
async def remove_room_product(
    room_id: str,
    product_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
):
    return await live_service.remove_product(db, merchant=user, room_id=room_id, product_id=product_id)


@router.post("/{room_id}/products/{product_id}/explain", response_model=dict)
async def set_product_explaining(
    room_id: str,
    product_id: str,
    explaining: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
):
    return await live_service.set_explaining(
        db, merchant=user, room_id=room_id, product_id=product_id, explaining=explaining
    )


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


@router.post("/{room_id}/ai-script")
async def ai_script(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> dict:
    """AI-3 直播数字人脚本：为直播间挂车商品生成开场/逐品讲解/收尾脚本。

    安全修复（P1#4）：先校验直播间归属，避免商家读取他人直播间的挂车商品信息。
    """
    room = await db.get(LiveRoom, room_id)
    if not room or room.merchant_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="直播间不存在")
    detail = await live_service.room_detail(db, room_id)
    if not detail.products:
        return {"opening": "", "items": [], "ending": ""}
    brief = [{"name": p.name, "price": p.price} for p in detail.products]
    return await ai_service.generate_live_script(products=brief)


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
                    # P0-M7：禁用账号不授予弹幕发送权限
                    if user and not user.is_active:
                        user = None
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
