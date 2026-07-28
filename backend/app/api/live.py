"""直播带货接口。"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
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
