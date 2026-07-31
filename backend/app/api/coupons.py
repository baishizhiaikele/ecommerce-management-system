from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.coupon import Coupon
from app.models.user import Role, User
from app.schemas.coupon import CouponCreate, CouponOut, CouponUpdate, UserCouponOut
from app.services import coupon_service
from app.utils.time import iso_utc

router = APIRouter(prefix="/coupons", tags=["coupons"])


@router.get("", response_model=list[CouponOut])
async def list_coupons(db: AsyncSession = Depends(get_db)) -> list:
    """可领取的优惠券列表（无需登录即可浏览）。"""
    return await coupon_service.list_active_coupons(db)


@router.post("/{coupon_id}/claim", response_model=CouponOut, status_code=status.HTTP_201_CREATED)
async def claim_coupon(
    coupon_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CouponOut:
    uc = await coupon_service.claim_coupon(db, user.id, coupon_id)
    return CouponOut(
        id=uc.coupon.id,
        name=uc.coupon.name,
        type=uc.coupon.type,
        threshold=uc.coupon.threshold,
        value=uc.coupon.value,
        expire_at=uc.coupon.expire_at,
        is_active=uc.coupon.is_active,
        merchant_id=uc.coupon.merchant_id,
        start_at=uc.coupon.start_at,
        end_at=uc.coupon.end_at,
        total=uc.coupon.total,
        issued=uc.coupon.issued,
    )


@router.get("/mine", response_model=list[UserCouponOut])
async def my_coupons(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list:
    rows = await coupon_service.list_my_coupons(db, user.id)
    return [
        UserCouponOut(
            id=uc.id,
            coupon_id=uc.coupon_id,
            name=uc.coupon.name,
            type=uc.coupon.type,
            threshold=uc.coupon.threshold,
            value=uc.coupon.value,
            expire_at=iso_utc(uc.coupon.expire_at or uc.coupon.end_at),
            is_used=uc.is_used,
            claimed_at=iso_utc(uc.claimed_at),
            merchant_id=uc.coupon.merchant_id,
            applicable_category=uc.coupon.applicable_category,
        )
        for uc in rows
        if uc.coupon is not None
    ]


@router.get("/admin", response_model=list[CouponOut])
async def admin_list(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.ADMIN)),
) -> list:
    """管理员：全部优惠券（含平台券与店铺券）。"""
    return await coupon_service.list_admin_coupons(db)


@router.get("/merchant", response_model=list[CouponOut])
async def merchant_list(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list:
    """商家：仅本人店铺发放的优惠券。"""
    return await coupon_service.list_merchant_coupons(db, user.id)


@router.post("", response_model=CouponOut, status_code=status.HTTP_201_CREATED)
async def create(
    p: CouponCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.ADMIN, Role.MERCHANT)),
) -> CouponOut:
    return await coupon_service.create_coupon(db, user, p)


@router.put("/{coupon_id}", response_model=CouponOut)
async def update(
    coupon_id: str,
    p: CouponUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.ADMIN, Role.MERCHANT)),
) -> CouponOut:
    return await coupon_service.update_coupon(db, coupon_id, user, p)


@router.delete("/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    coupon_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.ADMIN, Role.MERCHANT)),
) -> Response:
    await coupon_service.delete_coupon(db, coupon_id, user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
