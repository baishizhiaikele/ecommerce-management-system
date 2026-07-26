from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.shipping import ShippingTemplateCreate, ShippingTemplateOut
from app.services.shipping_service import (
    create_template,
    list_templates,
    set_default_template,
)

router = APIRouter(prefix="/shipping-templates", tags=["shipping"])


@router.post("", response_model=ShippingTemplateOut, status_code=201)
async def create(
    data: ShippingTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> ShippingTemplateOut:
    tpl = await create_template(db, user.id, data)
    return ShippingTemplateOut.model_validate(tpl)


@router.get("", response_model=list[ShippingTemplateOut])
async def list_my(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> list[ShippingTemplateOut]:
    tpls = await list_templates(db, user.id)
    return [ShippingTemplateOut.model_validate(t) for t in tpls]


@router.post("/{template_id}/default", response_model=ShippingTemplateOut)
async def set_default(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> ShippingTemplateOut:
    tpl = await set_default_template(db, user.id, template_id)
    return ShippingTemplateOut.model_validate(tpl)
