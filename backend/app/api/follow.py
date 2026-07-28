from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.follow import FollowShopOut, ShopEventOut
from app.services import follow_service

router = APIRouter(prefix="/follow", tags=["follow"])


@router.get("/feed", response_model=list[ShopEventOut])
async def follow_feed(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(require_role(Role.BUYER)),
) -> list[ShopEventOut]:
    """关注流：关注店铺的上新 / 降价动态。"""
    rows = await follow_service.list_feed(db, user_id=user.id, limit=limit)
    return [
        ShopEventOut(
            id=ev.id,
            merchant_id=ev.merchant_id,
            shop_name=shop_name,
            product_id=ev.product_id,
            event_type=ev.event_type,
            product_name=ev.product_name,
            image_url=ev.image_url,
            old_price=float(ev.old_price) if ev.old_price is not None else None,
            new_price=float(ev.new_price) if ev.new_price is not None else None,
            created_at=ev.created_at,
        )
        for ev, shop_name in rows
    ]


@router.post("/{merchant_id}", status_code=201)
async def follow_shop(
    merchant_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.BUYER)),
) -> dict:
    await follow_service.follow(db, user=user, merchant_id=merchant_id)
    return {"ok": True}


@router.delete("/{merchant_id}")
async def unfollow_shop(
    merchant_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.BUYER)),
) -> dict:
    await follow_service.unfollow(db, user=user, merchant_id=merchant_id)
    return {"ok": True}


@router.get("/{merchant_id}/status")
async def follow_status(
    merchant_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.BUYER)),
) -> dict:
    return {"following": await follow_service.is_following(db, user_id=user.id, merchant_id=merchant_id)}


@router.get("/{merchant_id}/count")
async def followers_count(merchant_id: str, db: AsyncSession = Depends(get_db)) -> dict:
    return {"count": await follow_service.count_followers(db, merchant_id=merchant_id)}


@router.get("/following", response_model=list[FollowShopOut])
async def my_following(
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(require_role(Role.BUYER)),
) -> list[FollowShopOut]:
    rows = await follow_service.list_following(db, user_id=user.id, limit=limit)
    result = []
    for merchant, followed_at in rows:
        result.append(
            FollowShopOut(
                merchant_id=merchant.id,
                shop_name=getattr(merchant, "shop_name", None) or merchant.username,
                shop_logo=getattr(merchant, "avatar_url", None),
                followers_count=await follow_service.count_followers(db, merchant_id=merchant.id),
                created_at=followed_at,
            )
        )
    return result
