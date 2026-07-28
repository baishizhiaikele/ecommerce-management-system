"""营销玩法接口（P3-C：秒杀 + 拼团 + 砍价）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import marketing_service as mkt

router = APIRouter(prefix="/marketing", tags=["marketing"])


# ---------- 秒杀 ----------
class FlashJoin(BaseModel):
    promotion_id: str
    quantity: int = 1
    address: str = ""


@router.post("/flash/join")
async def flash_join(
    body: FlashJoin, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    try:
        order = await mkt.join_flash(db, body.promotion_id, user, body.quantity, body.address)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"order_id": order.id, "order_no": order.order_no, "total_amount": float(order.total_amount)}


# ---------- 拼团 ----------
class GroupCreate(BaseModel):
    product_id: str
    price: float
    required_size: int = 2
    address: str = ""
    title: str | None = None


class GroupJoin(BaseModel):
    address: str = ""


@router.post("/groups")
async def create_group(
    body: GroupCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    gb = await mkt.create_group(
        db, body.product_id, user, body.price, body.required_size, body.address, body.title
    )
    return _group_out(gb)


@router.post("/groups/{group_id}/join")
async def join_group(
    group_id: str, body: GroupJoin, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    try:
        gb = await mkt.join_group(db, group_id, user, body.address)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _group_out(gb)


@router.get("/groups/{group_id}")
async def get_group(group_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    gb = await db.get(mkt.GroupBuy, group_id)
    if not gb:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="拼团不存在")
    return _group_out(gb)


def _group_out(gb) -> dict:
    return {
        "id": gb.id,
        "product_id": gb.product_id,
        "price": float(gb.price),
        "required_size": gb.required_size,
        "current_size": gb.current_size,
        "status": gb.status,
        "title": gb.title,
    }


# ---------- 砍价 ----------
class BargainCreate(BaseModel):
    product_id: str
    origin_price: float
    floor_price: float


class BargainAddress(BaseModel):
    address: str = ""


@router.post("/bargains")
async def create_bargain(
    body: BargainCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    b = await mkt.create_bargain(db, body.product_id, user, body.origin_price, body.floor_price)
    return _bargain_out(b)


@router.post("/bargains/{bargain_id}/cut")
async def cut_bargain(
    bargain_id: str, body: BargainAddress, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    try:
        b = await mkt.cut_bargain(db, bargain_id, user, body.address)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return _bargain_out(b)


@router.post("/bargains/{bargain_id}/buy")
async def buy_bargain(
    bargain_id: str, body: BargainAddress, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    try:
        order = await mkt.buy_bargain(db, bargain_id, user, body.address)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {"order_id": order.id, "order_no": order.order_no, "total_amount": float(order.total_amount)}


def _bargain_out(b) -> dict:
    return {
        "id": b.id,
        "product_id": b.product_id,
        "origin_price": float(b.origin_price),
        "floor_price": float(b.floor_price),
        "current_price": float(b.current_price),
        "status": b.status,
    }
