"""报表定时邮件服务：商家配置定期报表，调度器触发后生成并"发送"（记录 EmailLog）。"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.report import EmailLog, ReportFrequency, ReportTask
from app.services import dashboard_service


async def create_task(
    db: AsyncSession, merchant_id: str, frequency: ReportFrequency, email: str, is_active: bool = True
) -> ReportTask:
    task = ReportTask(
        merchant_id=merchant_id,
        frequency=frequency,
        email=email,
        is_active=is_active,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def list_for_merchant(db: AsyncSession, merchant_id: str) -> list[ReportTask]:
    rows = await db.scalars(
        select(ReportTask)
        .where(ReportTask.merchant_id == merchant_id)
        .order_by(ReportTask.created_at.desc())
    )
    return list(rows)


async def update_task(
    db: AsyncSession,
    task: ReportTask,
    is_active: bool | None = None,
    email: str | None = None,
    frequency: ReportFrequency | None = None,
) -> ReportTask:
    if is_active is not None:
        task.is_active = is_active
    if email is not None:
        task.email = email
    if frequency is not None:
        task.frequency = frequency
    await db.commit()
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, task: ReportTask) -> None:
    await db.delete(task)
    await db.commit()


async def build_report(db: AsyncSession, merchant_id: str) -> dict:
    """聚合经营报表数据（图表 + 摘要）。"""
    m = await dashboard_service.merchant_analytics(db, merchant_id)
    payload = m.model_dump() if hasattr(m, "model_dump") else dict(m)
    stats = payload.get("stats", {}) or {}
    gmv = float(stats.get("gmv", 0) or 0)
    orders = int(stats.get("orders", 0) or 0)
    payload["summary"] = f"近30天 GMV ¥{gmv:.2f}，订单 {orders} 笔；详见经营看板。"
    return payload


def _is_due(task: ReportTask, now: datetime) -> bool:
    if not task.last_sent_at:
        return True
    ls = task.last_sent_at
    if ls.tzinfo is None:  # SQLite 可能存朴素时间，统一按 UTC 处理
        ls = ls.replace(tzinfo=timezone.utc)
    delta = now - ls
    if task.frequency == ReportFrequency.DAILY:
        return delta >= timedelta(days=1)
    return delta >= timedelta(days=7)


async def send_due_reports(db: AsyncSession) -> int:
    """由调度器调用：找出到期任务，生成报表并写入发送记录。返回本次发送条数。"""
    now = datetime.now(timezone.utc)
    tasks = await db.scalars(select(ReportTask).where(ReportTask.is_active == True))  # noqa: E712
    sent = 0
    for task in list(tasks):
        if not _is_due(task, now):
            continue
        try:
            payload = await build_report(db, task.merchant_id)
        except Exception:
            continue
        log = EmailLog(
            merchant_id=task.merchant_id,
            report_task_id=task.id,
            to_email=task.email,
            subject=f"经营报表（{task.frequency.value}）",
            summary=payload.get("summary", ""),
        )
        db.add(log)
        task.last_sent_at = now
        sent += 1
    if sent:
        await db.commit()
    return sent
