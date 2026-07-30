"""实时通知 WebSocket 端点：/api/ws/notifications?token=<access_token>。"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.security import decode_token
from app.core.ws import manager
from app.db.session import SessionLocal
from app.models.user import User

router = APIRouter(tags=["ws"])


@router.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket, token: str = "") -> None:
    # 令牌可来自 query 参数、Authorization 头或 HttpOnly Cookie（前端 JS 拿不到 cookie，走此通道）
    if not token:
        token = websocket.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        token = websocket.cookies.get("access_token", "")
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4401)
            return
    except Exception:  # noqa: BLE001
        await websocket.close(code=4401)
        return

    # P0-M7：校验用户存在且未禁用，禁用账号立即关闭连接
    try:
        async with SessionLocal() as db:
            user = await db.scalar(select(User).where(User.id == user_id))
        if not user or not user.is_active:
            await websocket.close(code=4403)
            return
    except Exception:  # noqa: BLE001
        await websocket.close(code=4403)
        return

    await manager.connect(user_id, websocket)
    try:
        # 保持连接：前端可定时发送心跳（如 "ping"），此处仅消费以避免连接关闭
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception:  # noqa: BLE001
        manager.disconnect(user_id, websocket)
