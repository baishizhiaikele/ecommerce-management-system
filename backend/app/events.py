import logging
from typing import Awaitable, Callable

from app.core.config import settings

logger = logging.getLogger("ai_shop.events")

EventHandler = Callable[..., Awaitable[None]]


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, list[EventHandler]] = {}

    def subscribe(self, event: str, handler: EventHandler) -> None:
        self._subscribers.setdefault(event, []).append(handler)

    async def publish(self, event: str, **kwargs) -> None:
        for handler in self._subscribers.get(event, []):
            try:
                await handler(**kwargs)
            except Exception as exc:  # 事件处理失败不应中断主流程
                logger.error("event %s handler failed: %s", event, exc)


bus = EventBus()
