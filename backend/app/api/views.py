from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.view import BoughtOut, ViewLogIn, ViewLogOut
from app.services import view_service

router = APIRouter(prefix="/me", tags=["me"])


@router.post("/view-log", status_code=201)
async def log_view(
    data: ViewLogIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    await view_service.log_view(db, user_id=user.id, payload=data)
    return {"ok": True}


@router.get("/history", response_model=list[ViewLogOut])
async def get_history(
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list:
    return await view_service.list_history(db, user_id=user.id, limit=limit)


@router.get("/recently-bought", response_model=list[BoughtOut])
async def get_recently_bought(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list:
    return await view_service.recently_bought(db, user_id=user.id)
