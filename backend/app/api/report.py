"""商家经营报表 + 定时邮件配置 API。"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import MerchantCtx, require_merchant
from app.db.session import get_db
from app.models.report import ReportFrequency
from app.schemas.report import ReportTaskCreate, ReportTaskOut, ReportTaskUpdate
from app.services import report_task_service

router = APIRouter(prefix="/merchant/report-tasks", tags=["report"])


def _to_out(t) -> ReportTaskOut:
    return ReportTaskOut(
        id=t.id,
        merchant_id=t.merchant_id,
        frequency=t.frequency.value,
        email=t.email,
        is_active=t.is_active,
        last_sent_at=t.last_sent_at.isoformat() if t.last_sent_at else None,
        created_at=t.created_at.isoformat() if t.created_at else None,
    )


@router.get("", response_model=list[ReportTaskOut])
async def list_tasks(
    ctx: MerchantCtx = Depends(require_merchant()),
    db: AsyncSession = Depends(get_db),
):
    rows = await report_task_service.list_for_merchant(db, ctx.owner_id)
    return [_to_out(r) for r in rows]


@router.post("", response_model=ReportTaskOut)
async def create_task(
    data: ReportTaskCreate,
    ctx: MerchantCtx = Depends(require_merchant()),
    db: AsyncSession = Depends(get_db),
):
    if "@" not in data.email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱格式不正确")
    t = await report_task_service.create_task(
        db, ctx.owner_id, data.frequency, data.email, data.is_active
    )
    return _to_out(t)


@router.put("/{task_id}", response_model=ReportTaskOut)
async def update_task(
    task_id: str,
    data: ReportTaskUpdate,
    ctx: MerchantCtx = Depends(require_merchant()),
    db: AsyncSession = Depends(get_db),
):
    t = await report_task_service.list_for_merchant(db, ctx.owner_id)
    task = next((x for x in t if x.id == task_id), None)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    task = await report_task_service.update_task(
        db, task, is_active=data.is_active, email=data.email, frequency=data.frequency
    )
    return _to_out(task)


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    ctx: MerchantCtx = Depends(require_merchant()),
    db: AsyncSession = Depends(get_db),
):
    rows = await report_task_service.list_for_merchant(db, ctx.owner_id)
    task = next((x for x in rows if x.id == task_id), None)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")
    await report_task_service.delete_task(db, task)
    return {"msg": "ok"}


@router.get("/preview")
async def preview(
    ctx: MerchantCtx = Depends(require_merchant()),
    db: AsyncSession = Depends(get_db),
):
    """返回经营报表数据，供前端图表渲染。"""
    return await report_task_service.build_report(db, ctx.owner_id)
