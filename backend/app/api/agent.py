"""AI 可行动代理层接口（P3-B）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.services import agent_service

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatIn(BaseModel):
    message: str
    product_id: str | None = None
    address: str | None = None
    tool: str | None = None


class ToolCallIn(BaseModel):
    tool: str
    params: dict = {}


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
    return await agent_service.agent_chat(
        db, user, body.message, body.product_id, body.address, body.tool
    )


@router.post("/tool")
async def call_tool(
    body: ToolCallIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """由前端直接触发某个工具（精确调用，绕过意图识别）。"""
    if body.tool not in agent_service.TOOLS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="未知工具")
    return await agent_service.agent_chat(
        db,
        user,
        "",
        product_id=body.params.get("product_id"),
        address=body.params.get("address"),
        tool=body.tool,
    )
