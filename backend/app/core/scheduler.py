"""后台定时任务：自动取消超时未支付订单并回补库存。

通过 FastAPI lifespan 启动的 asyncio 任务循环执行，无需额外依赖（如 APScheduler）。
扫描 created_at 超过 EXPIRE_MINUTES 且仍处于 PENDING_PAYMENT 的订单，
借助订单状态机将其流转到 CANCELLED（该分支会自动回补库存并写流水）。
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app.core.db_errors import is_deadlock
from app.db.session import SessionLocal
from app.models.order import Order, OrderStatus
from app.models.user import Role
from app.services.order_service import transition_status
from app.services import report_task_service

logger = logging.getLogger("scheduler")

EXPIRE_MINUTES = 30


async def _cancel_expired_orders() -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=EXPIRE_MINUTES)
    async with SessionLocal() as db:
        orders = list(
            await db.scalars(
                select(Order).where(
                    Order.status == OrderStatus.PENDING_PAYMENT,
                    Order.created_at < cutoff,
                )
            )
        )
        cancelled = 0
        for order in orders:
            try:
                await transition_status(
                    db,
                    order=order,
                    target=OrderStatus.CANCELLED,
                    actor_id=order.buyer_id,
                    role=Role.ADMIN,
                )
                cancelled += 1
            except OperationalError as e:
                # 并发取消竞态：回滚后下一轮扫描会重试
                await db.rollback()
                if is_deadlock(e):
                    logger.warning("自动取消超时订单 %s 遇死锁，已回滚", order.id)
                else:
                    logger.warning("自动取消超时订单 %s 数据库错误: %s", order.id, e)
            except Exception as e:  # noqa: BLE001
                await db.rollback()
                logger.warning("自动取消超时订单 %s 失败: %s", order.id, e)
        return cancelled


async def scheduler_loop(interval_seconds: int = 60) -> None:
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            n = await _cancel_expired_orders()
            if n:
                logger.info("已自动取消 %d 笔超时未支付订单并回补库存", n)
        except Exception as e:  # noqa: BLE001
            logger.warning("支付超时扫描异常: %s", e)
        try:
            m = await report_task_service.send_due_reports()
            if m:
                logger.info("已生成并发送 %d 封定时报表邮件", m)
        except Exception as e:  # noqa: BLE001
            logger.warning("定时报表发送异常: %s", e)
