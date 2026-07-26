from fastapi import HTTPException, status
from sqlalchemy import select, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shipping import ShippingTemplate


async def list_templates(db: AsyncSession, merchant_id: str) -> list[ShippingTemplate]:
    rows = await db.scalars(
        select(ShippingTemplate)
        .where(ShippingTemplate.merchant_id == merchant_id)
        .order_by(ShippingTemplate.created_at.desc())
    )
    return list(rows)


async def create_template(db: AsyncSession, merchant_id: str, data: "ShippingTemplateCreate") -> ShippingTemplate:
    if data.is_default:
        await db.execute(
            sa_update(ShippingTemplate)
            .where(ShippingTemplate.merchant_id == merchant_id)
            .values(is_default=False)
        )
    tpl = ShippingTemplate(
        merchant_id=merchant_id,
        name=data.name,
        base_fee=data.base_fee,
        free_amount=data.free_amount,
        is_default=data.is_default,
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return tpl


async def set_default_template(db: AsyncSession, merchant_id: str, template_id: str) -> ShippingTemplate:
    tpl = await db.get(ShippingTemplate, template_id)
    if not tpl or tpl.merchant_id != merchant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="运费模板不存在")
    await db.execute(
        sa_update(ShippingTemplate)
        .where(ShippingTemplate.merchant_id == merchant_id)
        .values(is_default=False)
    )
    tpl.is_default = True
    await db.commit()
    await db.refresh(tpl)
    return tpl


async def get_default_template(db: AsyncSession, merchant_id: str) -> ShippingTemplate | None:
    return await db.scalar(
        select(ShippingTemplate).where(
            ShippingTemplate.merchant_id == merchant_id,
            ShippingTemplate.is_default.is_(True),
        )
    )


async def compute_freight(db: AsyncSession, merchant_id: str, subtotal: float) -> float:
    """按商家默认运费模板计算运费；无模板或满额则包邮。"""
    tpl = await get_default_template(db, merchant_id)
    if not tpl:
        return 0.0
    if tpl.free_amount and subtotal >= tpl.free_amount:
        return 0.0
    return float(tpl.base_fee)
