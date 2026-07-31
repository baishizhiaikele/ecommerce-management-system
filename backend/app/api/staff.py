"""子账号（商家员工）管理 API。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import MerchantCtx, require_merchant
from app.db.session import get_db
from app.models.staff import STAFF_PERMISSIONS
from app.models.user import User
from app.schemas.staff import StaffCreate, StaffOut, StaffUpdate
from app.services import subaccount_service
from app.utils.time import iso_utc

router = APIRouter(prefix="/subaccounts", tags=["staff"])


def _to_out(sub) -> StaffOut:
    return StaffOut(
        id=sub.id,
        owner_id=sub.owner_id,
        staff_user_id=sub.staff_user_id,
        username=sub.staff.username,
        permissions=sub.permissions.split(",") if sub.permissions else [],
        is_active=sub.is_active,
        created_at=iso_utc(sub.created_at),
    )


@router.get("/permissions")
async def list_permissions():
    """返回可授权的权限键与中文名（供前端渲染权限矩阵）。"""
    return {
        "permissions": [
            {"key": k, "label": subaccount_service.permission_label(k)}
            for k in STAFF_PERMISSIONS
        ]
    }


@router.post("", response_model=StaffOut)
async def create(
    data: StaffCreate,
    ctx: MerchantCtx = Depends(require_merchant()),
    db: AsyncSession = Depends(get_db),
):
    try:
        sub = await subaccount_service.create_subaccount(
            db, ctx.user, data.username, data.password, data.permissions
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    await db.refresh(sub, attribute_names=["staff"])
    return _to_out(sub)


@router.get("/mine", response_model=list[StaffOut])
async def mine(
    ctx: MerchantCtx = Depends(require_merchant()),
    db: AsyncSession = Depends(get_db),
):
    rows = await subaccount_service.list_for_owner(db, ctx.owner_id)
    return [_to_out(r) for r in rows]


@router.put("/{sub_id}", response_model=StaffOut)
async def update_(
    sub_id: str,
    data: StaffUpdate,
    ctx: MerchantCtx = Depends(require_merchant()),
    db: AsyncSession = Depends(get_db),
):
    sub = await subaccount_service.get_one(db, ctx.owner_id, sub_id)
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="子账号不存在")
    sub = await subaccount_service.update_subaccount(
        db, sub, permissions=data.permissions, is_active=data.is_active
    )
    await db.refresh(sub, attribute_names=["staff"])
    return _to_out(sub)


@router.delete("/{sub_id}")
async def delete_(
    sub_id: str,
    ctx: MerchantCtx = Depends(require_merchant()),
    db: AsyncSession = Depends(get_db),
):
    sub = await subaccount_service.get_one(db, ctx.owner_id, sub_id)
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="子账号不存在")
    await subaccount_service.delete_subaccount(db, sub)
    return {"msg": "ok"}
