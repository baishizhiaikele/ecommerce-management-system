from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.core.cache import cache_health
from app.core.metrics import collect_alerts
from app.db.session import SessionLocal

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    """服务健康检查：探测 DB 与缓存层连通性，任一关键依赖不可用则返回 503。

    同时汇总可观测性告警（验签失败突增、资源超阈值）；依赖健康但有告警时
    返回 200 + status=degraded + alerts，便于监控侧区分「不可用」与「需关注」。
    """
    components: dict = {}

    # 数据库连通性
    try:
        async with SessionLocal() as db:
            await db.execute(__import__("sqlalchemy").text("SELECT 1"))
        components["database"] = {"ok": True}
    except Exception as exc:  # noqa: BLE001
        components["database"] = {"ok": False, "error": str(exc)}

    # 缓存层
    try:
        components["cache"] = await cache_health()
    except Exception as exc:  # noqa: BLE001
        components["cache"] = {"ok": False, "error": str(exc)}

    # 业务/资源告警
    alerts = collect_alerts()

    deps_ok = all(c.get("ok") for c in components.values())
    has_alerts = bool(alerts)
    if not deps_ok:
        payload = {
            "status": "unavailable",
            "service": "ai-shop",
            "components": components,
            "alerts": alerts,
        }
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)
    payload = {
        "status": "degraded" if has_alerts else "ok",
        "service": "ai-shop",
        "components": components,
        "alerts": alerts,
    }
    return payload
