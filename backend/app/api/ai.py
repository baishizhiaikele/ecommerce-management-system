from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_role
from app.db.session import get_db
from app.models.user import Role, User
from app.schemas.ai import HomeArrangeOut, TrendInsightOut
from app.schemas.chat import ChatRequest, ConversationOut
from app.services import chat_service
from app.services.ai_features_service import arrange_home, trend_insight
from app.services.ai_marketing_service import active_marketing
from app.services.ai_service import ai_service

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/chat")
async def chat(
    data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conversation = await chat_service.chat(db, user_id=user.id, data=data)
    reply = next((m.content for m in reversed(conversation.messages) if m.role.value == "ai"), "")
    needs_human = await ai_service.needs_human(data.message)
    return {
        "conversation_id": conversation.id,
        "reply": reply,
        "needs_human": needs_human,
    }


@router.get("/conversations", response_model=list[ConversationOut])
async def conversations(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> list:
    return await chat_service.list_conversations(db, user.id)


# ---------------------------------------------------------------------------
# B4：AI 首页编排（真实用户身份 + 时段动态排布楼层与内容）
# ---------------------------------------------------------------------------
@router.get("/home-arrange", response_model=HomeArrangeOut, summary="AI 首页编排")
async def home_arrange(
    segment: str | None = Query(None, description="调试/演示用身份覆盖：buyer|new|returning|member"),
    hour: int | None = Query(None, ge=0, le=23, description="时段(0-23)，缺省取当前小时"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await arrange_home(db, segment_override=segment, hour=hour, user=user)


@router.get("/active-marketing", summary="AI-1 主动营销建议")
async def active_marketing_endpoint(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    """AI-1 客服主动营销：基于用户画像推送优惠券与搭配套餐建议。"""
    return await active_marketing(db, user)


# ---------------------------------------------------------------------------
# B5：AI 选品 / 趋势洞察（商家后台）
# ---------------------------------------------------------------------------
@router.get("/trend-insight", response_model=TrendInsightOut, summary="AI 选品/趋势洞察")
async def trend_insight_endpoint(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.MERCHANT)),
) -> TrendInsightOut:
    return await trend_insight(db)
