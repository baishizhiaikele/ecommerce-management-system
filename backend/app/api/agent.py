"""AI 可行动代理层接口（P3-B）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import agent_service
from app.services.agent_service import route_intent

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatIn(BaseModel):
    message: str
    product_id: str | None = None
    address: str | None = None
    tool: str | None = None


class ToolCallIn(BaseModel):
    tool: str
    params: dict = {}
    confirm: bool = False  # P0-F3：写操作需显式确认


@router.get("/tools")
async def tools() -> list[dict]:
    """列出代理可调用的工具（供前端/LLM function-calling 使用）。"""
    return agent_service.list_tools()


@router.post("/chat")
async def chat(
    body: ChatIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # P0-F3：写操作（checkout/add_to_cart）不允许通过聊天自动触发，需走 /agent/tool 显式调用
    if not body.tool:
        intent = agent_service.route_intent(body.message)
        if intent in ("checkout", "add_to_cart"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"操作 '{intent}' 需要确认后才能执行。请通过 /agent/tool 接口显式调用或在前端确认后再试。",
            )
    # P0-F3：地址为空时禁止下单（防止占位符生成脏订单）
    if body.tool == "checkout" and not (body.address and body.address.strip() and body.address != "（未提供地址）"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="下单需要提供收货地址，例如：北京市海淀区xx路1号",
        )
    return await agent_service.agent_chat(
        db, user, body.message, body.product_id, body.address, body.tool
    )


@router.post("/tool")
async def call_tool(
    body: ToolCallIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """由前端直接触发某个工具（精确调用，绕过意图识别）。

    P0-F3：写操作（checkout/add_to_cart）需 body.confirm=True 才会真实执行。
    """
    if body.tool not in agent_service.TOOLS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="未知工具")
    # P0-F3：写操作需确认
    confirm = body.confirm
    if body.tool in ("checkout", "add_to_cart") and not confirm:
        # 未确认时返回预览
        confirm = False
    return await agent_service.agent_chat(
        db,
        user,
        "",
        product_id=body.params.get("product_id"),
        address=body.params.get("address"),
        tool=body.tool,
        confirm=confirm,
    )
