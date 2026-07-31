from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import require_role
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.product import Product, ProductStatus
from app.models.user import Role, User
from app.schemas.audit import AuditLogOut
from app.schemas.dashboard import AdminStats, DashboardAnalytics, TrendPoint
from app.schemas.product import ProductOut
from app.schemas.review import ReviewOut
from app.schemas.user import UserOut, UserUpdate
from app.services import dashboard_service, review_service
from app.services.async_queue import backend as queue_backend, stats as queue_stats
from app.services.audit_service import record

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db), _: User = Depends(require_role(Role.ADMIN))
) -> list[UserOut]:
    rows = await db.scalars(select(User).order_by(User.created_at.desc()))
    return list(rows)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role(Role.ADMIN)),
) -> UserOut:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="不能修改自己的角色或状态"
        )
    changes: list[str] = []
    if data.is_active is not None and data.is_active != user.is_active:
        user.is_active = data.is_active
        changes.append(f"is_active={user.is_active}")
    if data.role is not None and data.role != Role.ADMIN and data.role != user.role:
        user.role = data.role
        changes.append(f"role={user.role.value}")
    await record(
        db, admin.id, "user.update", "user", user.id, ", ".join(changes) or "无变更"
    )
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/products", response_model=list[ProductOut])
async def list_products(
    status_filter: ProductStatus | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(Role.ADMIN)),
) -> list[ProductOut]:
    stmt = select(Product)
    if status_filter:
        stmt = stmt.where(Product.status == status_filter)
    rows = await db.scalars(stmt.order_by(Product.created_at.desc()))
    return list(rows)


@router.get("/dashboard/stats", response_model=AdminStats)
async def stats(db: AsyncSession = Depends(get_db), _: User = Depends(require_role(Role.ADMIN))) -> AdminStats:
    return await dashboard_service.admin_stats(db)


@router.get("/dashboard/trend", response_model=list[TrendPoint])
async def trend(
    days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(Role.ADMIN)),
) -> list[TrendPoint]:
    return await dashboard_service.sales_trend(db, days=days)


@router.get("/dashboard/analytics", response_model=DashboardAnalytics)
async def analytics(
    db: AsyncSession = Depends(get_db), _: User = Depends(require_role(Role.ADMIN))
) -> DashboardAnalytics:
    return await dashboard_service.dashboard_analytics(db)


@router.get("/queue/stats")
async def queue_stats(_: User = Depends(require_role(Role.ADMIN))) -> dict:
    """异步队列运行指标（P2 工程 stub 观测）。"""
    return {"backend": queue_backend(), **queue_stats()}


@router.get("/reviews/negative", response_model=list[ReviewOut])
async def negative_reviews(
    db: AsyncSession = Depends(get_db), _: User = Depends(require_role(Role.ADMIN))
) -> list[ReviewOut]:
    from app.models.review import Review, Sentiment

    rows = await db.scalars(
        select(Review)
        .options(selectinload(Review.user))
        .where(Review.sentiment == Sentiment.NEGATIVE)
        .order_by(Review.created_at.desc())
    )
    return list(rows)


@router.get("/audit-logs", response_model=list[AuditLogOut])
async def audit_logs(
    db: AsyncSession = Depends(get_db), _: User = Depends(require_role(Role.ADMIN))
) -> list[AuditLogOut]:
    rows = await db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(200))
    return list(rows)


@router.get("/audit-stats")
async def audit_stats(
    db: AsyncSession = Depends(get_db), _: User = Depends(require_role(Role.ADMIN))
) -> dict:
    by_action_rows = await db.execute(
        select(AuditLog.action, func.count(AuditLog.id))
        .group_by(AuditLog.action)
        .order_by(func.count(AuditLog.id).desc())
    )
    by_action = [{"action": a, "count": c} for a, c in by_action_rows]

    by_day_rows = await db.execute(
        select(func.date(AuditLog.created_at), func.count(AuditLog.id))
        .group_by(func.date(AuditLog.created_at))
        .order_by(func.date(AuditLog.created_at))
        .limit(30)
    )
    by_day = [{"day": d, "count": c} for d, c in by_day_rows]
    return {"by_action": by_action, "by_day": by_day}


@router.get("/audit/replay", response_model=list[AuditLogOut])
async def audit_replay(
    entity: str,
    entity_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(Role.ADMIN)),
) -> list[AuditLogOut]:
    """按实体回放审计时间线（升序），用于追溯某订单/商品的完整操作链。"""
    stmt = select(AuditLog).where(AuditLog.entity == entity)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    stmt = stmt.order_by(AuditLog.created_at.asc())
    rows = await db.scalars(stmt)
    return list(rows)


@router.get("/audit/alerts")
async def audit_alerts(
    db: AsyncSession = Depends(get_db), _: User = Depends(require_role(Role.ADMIN))
) -> dict:
    """基于规则的审计告警：自动退款秒退、高频操作、频繁改价等异常模式。"""
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    alerts: list[dict] = []

    # 1) 自动退款秒退（金额小、无需人工）
    auto = await db.scalars(
        select(AuditLog).where(
            AuditLog.action == "auto_refund", AuditLog.created_at >= cutoff
        )
    )
    auto = list(auto)
    if auto:
        alerts.append(
            {
                "level": "info",
                "type": "auto_refund",
                "message": f"近 24 小时触发 {len(auto)} 笔自动退款（小额免审）",
                "count": len(auto),
                "samples": [a.entity_id for a in auto[:5]],
            }
        )

    # 2) 同一用户高频操作（潜在脚本/刷量）
    rows = await db.execute(
        select(AuditLog.user_id, func.count(AuditLog.id))
        .where(AuditLog.created_at >= cutoff)
        .group_by(AuditLog.user_id)
        .having(func.count(AuditLog.id) > 10)
    )
    hot = [{"user_id": u, "count": c} for u, c in rows]
    if hot:
        alerts.append(
            {
                "level": "warning",
                "type": "high_frequency_action",
                "message": f"近 24 小时有 {len(hot)} 个账号操作异常频繁（>10 次）",
                "count": len(hot),
                "samples": [h["user_id"] for h in hot[:5]],
            }
        )

    # 3) 同一商品频繁改价（潜在价格操纵）
    price_rows = await db.execute(
        select(AuditLog.entity_id, func.count(AuditLog.id))
        .where(
            AuditLog.action == "product.update",
            AuditLog.entity == "product",
            AuditLog.created_at >= cutoff,
        )
        .group_by(AuditLog.entity_id)
        .having(func.count(AuditLog.id) > 3)
    )
    freq = [{"product_id": p, "count": c} for p, c in price_rows]
    if freq:
        alerts.append(
            {
                "level": "warning",
                "type": "frequent_price_change",
                "message": f"近 24 小时有 {len(freq)} 个商品改价次数过多（>3 次）",
                "count": len(freq),
                "samples": [f["product_id"] for f in freq[:5]],
            }
        )

    return {"alerts": alerts, "generated_at": datetime.now(timezone.utc).isoformat()}
