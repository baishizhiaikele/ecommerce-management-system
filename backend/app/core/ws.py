"""WebSocket 连接管理：按用户维护活动连接，用于实时通知推送。"""
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self.active.setdefault(user_id, []).append(ws)

    def disconnect(self, user_id: str, ws: WebSocket) -> None:
        if user_id not in self.active:
            return
        if ws in self.active[user_id]:
            self.active[user_id].remove(ws)
        if not self.active[user_id]:
            self.active.pop(user_id, None)

    async def send_personal(self, user_id: str, message: dict) -> None:
        for ws in list(self.active.get(user_id, [])):
            try:
                await ws.send_json(message)
            except Exception:  # noqa: BLE001
                self.disconnect(user_id, ws)


manager = ConnectionManager()
