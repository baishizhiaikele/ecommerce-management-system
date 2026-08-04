import asyncio
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.order import Order, OrderItem
from app.models.product import Product
from app.models.support import (
    SenderRole,
    SupportAttachment,
    SupportMessage,
    SupportTicket,
    TicketCategory,
    TicketPriority,
    TicketStatus,
)
from app.models.user import Role, User
from app.schemas.support import SupportMessageOut, SupportTicketOut
from app.utils.time import iso_utc

PRIORITY_VALUES = {p.value for p in TicketPriority}
CATEGORY_VALUES = {c.value for c in TicketCategory}


def _coerce_priority(value: str) -> TicketPriority:
    return TicketPriority(value) if value in PRIORITY_VALUES else TicketPriority.NORMAL


def _coerce_category(value: str) -> TicketCategory:
    return TicketCategory(value) if value in CATEGORY_VALUES else TicketCategory.OTHER


async def _reload(db: AsyncSession, ticket_id: str) -> SupportTicket:
    """commit 后重载工单并预加载 messages（含附件），避免序列化时触发 async lazy-load。"""
    result = await db.execute(
        select(SupportTicket)
        .options(selectinload(SupportTicket.messages).selectinload(SupportMessage.attachments))
        .where(SupportTicket.id == ticket_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


def _message_out(m: SupportMessage, atts: dict) -> SupportMessageOut:
    return SupportMessageOut(
        id=m.id,
        sender_role=m.sender_role,
        content=m.content,
        is_internal=bool(m.is_internal),
        is_revoked=bool(m.is_revoked),
        attachments=[a for a in atts.get(m.id, [])],
        created_at=iso_utc(m.created_at),
    )


async def _to_out(db: AsyncSession, t: SupportTicket, viewer_role: str) -> SupportTicketOut:
    product = await db.get(Product, t.product_id) if t.product_id else None
    user = await db.get(User, t.user_id)
    order = await db.get(Order, t.order_id) if t.order_id else None

    messages = [m for m in t.messages]
    att_rows = await db.execute(
        select(SupportAttachment).where(
            SupportAttachment.message_id.in_([m.id for m in messages])
        )
    )
    att_by_msg: dict[str, list] = {}
    for a in att_rows.scalars():
        att_by_msg.setdefault(a.message_id, []).append(
            {
                "id": a.id,
                "url": a.url,
                "filename": a.filename,
                "content_type": a.content_type,
            }
        )

    visible = (
        messages
        if viewer_role == Role.MERCHANT.value
        else [m for m in messages if not m.is_internal]
    )

    return SupportTicketOut(
        id=t.id,
        status=t.status,
        subject=t.subject,
        product_id=t.product_id,
        product_name=product.name if product else None,
        order_id=t.order_id,
        order_no=order.order_no if order else None,
        user_id=t.user_id,
        user_name=user.username if user else "用户",
        priority=t.priority.value,
        category=t.category.value,
        satisfaction_rating=t.satisfaction_rating,
        satisfaction_comment=t.satisfaction_comment,
        unread_for_buyer=t.unread_for_buyer,
        unread_for_merchant=t.unread_for_merchant,
        created_at=t.created_at,
        updated_at=t.updated_at,
        messages=[_message_out(m, att_by_msg) for m in visible],
    )


async def _make_attachments(db: AsyncSession, message_id: str, urls: list[str]) -> None:
    for url in urls or []:
        if not url:
            continue
        name = url.rsplit("/", 1)[-1]
        db.add(SupportAttachment(message_id=message_id, url=url, filename=name))


async def _ai_answer(db: AsyncSession, question: str, product: Product | None, merchant_id: str | None) -> str | None:
    """结合知识库与商品上下文生成智能回复（离线/无密钥时降级）。"""
    from app.services import ai_service, knowledge_service

    try:
        kb = await knowledge_service.suggest(db, merchant_id, question, limit=2)
    except Exception:
        kb = []
    kb_text = "\n".join(f"- {k.content}" for k, _ in kb) if kb else "（暂无相关已沉淀知识）"
    product_ctx = ""
    if product:
        product_ctx = f"商品：{product.name}\n描述：{product.description or '无'}"

    try:
        return await ai_service.customer_reply(
            product_ctx=product_ctx,
            history=[],
            question=question,
        ) + (f"\n\n参考知识：{kb_text}" if kb else "")
    except Exception:
        if kb:
            return "（智能客服）根据常见解答：\n" + kb[0][0].content
        return "（智能客服）已收到您的问题，我们正在为您查询，稍后由人工客服为您详细解答。"


async def create_ticket(
    db: AsyncSession,
    *,
    buyer: User,
    product_id: str | None,
    message: str,
    subject: str | None,
    priority: str = "normal",
    category: str = "other",
    order_id: str | None = None,
    attachments: list[str] | None = None,
) -> SupportTicketOut:
    merchant_id = buyer.id
    product = None
    order = None
    if product_id:
        product = await db.get(Product, product_id)
        if not product:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="商品不存在")
        merchant_id = product.merchant_id
    if order_id:
        order = await db.get(Order, order_id)
        if not order or order.buyer_id != buyer.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="订单无关联权限")
        order_no = order.order_no
        if not product_id:
            # Order 模型没有 merchant_id 字段；通过订单项关联的首个商品定位商家
            item = await db.scalar(select(OrderItem).where(OrderItem.order_id == order.id).limit(1))
            if item:
                prod = await db.get(Product, item.product_id)
                if prod:
                    merchant_id = prod.merchant_id

    ticket = SupportTicket(
        user_id=buyer.id,
        merchant_id=merchant_id,
        product_id=product_id,
        order_id=order_id,
        subject=subject or (product.name if product else "售后咨询"),
        status=TicketStatus.OPEN,
        priority=_coerce_priority(priority),
        category=_coerce_category(category),
    )
    first = SupportMessage(sender_role=SenderRole.BUYER, content=message)
    ticket.messages.append(first)
    db.add(ticket)
    await db.flush()
    await _make_attachments(db, first.id, attachments or [])

    # 商家有一条买家消息待查看
    ticket.unread_for_merchant += 1

    # AI 智能首答：买家提交后立刻给出智能回复（失败不阻断建单）。
    # 用 wait_for 兜底，避免 AI 接口慢/不通时阻塞整个提交请求导致前端超时。
    try:
        ai_text = await asyncio.wait_for(
            _ai_answer(db, message, product, merchant_id), timeout=6
        )
        if ai_text:
            ai_msg = SupportMessage(sender_role=SenderRole.AI, content=ai_text)
            ticket.messages.append(ai_msg)
            await db.flush()
            ticket.unread_for_merchant += 1
    except Exception:
        pass

    await db.commit()
    ticket = await _reload(db, ticket.id)
    return await _to_out(db, ticket, buyer.role.value)


async def list_tickets(
    db: AsyncSession,
    *,
    user: User,
    status_filter: str | None = None,
    priority: str | None = None,
    category: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 10,
) -> tuple[list[SupportTicketOut], int]:
    base = select(SupportTicket).options(
        selectinload(SupportTicket.messages).selectinload(SupportMessage.attachments)
    )
    if user.role == Role.MERCHANT:
        base = base.where(SupportTicket.merchant_id == user.id)
    else:
        base = base.where(SupportTicket.user_id == user.id)

    conditions = []
    if status_filter and status_filter != "all":
        conditions.append(SupportTicket.status == TicketStatus(status_filter))
    if priority and priority != "all":
        conditions.append(SupportTicket.priority == TicketPriority(priority))
    if category and category != "all":
        conditions.append(SupportTicket.category == TicketCategory(category))
    if search:
        like = f"%{search}%"
        sub = select(SupportMessage.ticket_id).where(SupportMessage.content.ilike(like))
        conditions.append(or_(SupportTicket.subject.ilike(like), SupportTicket.id.in_(sub)))
    if conditions:
        base = base.where(*conditions)

    # 默认排序：优先级权重（urgent 置顶） + 最近更新时间
    # 4 级：urgent(0) > high(1) > normal(2) > low(3)
    priority_weight = case(
        (SupportTicket.priority == "urgent", 0),
        (SupportTicket.priority == "high", 1),
        (SupportTicket.priority == "normal", 2),
        (SupportTicket.priority == "low", 3),
        else_=2,
    )

    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    rows = await db.scalars(
        base.order_by(priority_weight, SupportTicket.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [await _to_out(db, t, user.role.value) for t in rows]
    return items, total or 0


async def unread_count(db: AsyncSession, user: User) -> int:
    if user.role == Role.MERCHANT:
        col = SupportTicket.unread_for_merchant
        cond = SupportTicket.merchant_id == user.id
    else:
        col = SupportTicket.unread_for_buyer
        cond = SupportTicket.user_id == user.id
    value = await db.scalar(
        select(func.coalesce(func.sum(col), 0)).where(cond, SupportTicket.status != TicketStatus.CLOSED)
    )
    return int(value or 0)


async def get_ticket(db: AsyncSession, ticket_id: str, user: User) -> SupportTicket:
    t = await db.get(
        SupportTicket,
        ticket_id,
        options=[selectinload(SupportTicket.messages).selectinload(SupportMessage.attachments)],
    )
    if not t:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="工单不存在")
    if user.role == Role.MERCHANT and t.merchant_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问")
    if user.role == Role.BUYER and t.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问")
    return t


async def mark_read(db: AsyncSession, ticket: SupportTicket, user: User) -> None:
    if user.role == Role.MERCHANT:
        ticket.unread_for_merchant = 0
    else:
        ticket.unread_for_buyer = 0
    await db.commit()


async def add_message(
    db: AsyncSession,
    ticket: SupportTicket,
    sender_role: SenderRole,
    content: str,
    *,
    is_internal: bool = False,
    attachments: list[str] | None = None,
) -> SupportTicketOut:
    if is_internal and sender_role != SenderRole.MERCHANT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅商家可添加内部备注")
    msg = SupportMessage(sender_role=sender_role, content=content, is_internal=is_internal)
    ticket.messages.append(msg)
    await db.flush()
    await _make_attachments(db, msg.id, attachments or [])

    if is_internal:
        # 内部备注不计入买家未读、不改变工单状态
        pass
    elif sender_role == SenderRole.MERCHANT:
        ticket.unread_for_buyer += 1
        ticket.status = TicketStatus.ANSWERED
    else:  # 买家消息
        ticket.unread_for_merchant += 1
        ticket.status = TicketStatus.OPEN

    viewer_role = Role.MERCHANT.value if sender_role == SenderRole.MERCHANT else Role.BUYER.value
    await db.commit()
    ticket = await _reload(db, ticket.id)
    return await _to_out(db, ticket, viewer_role)


# 撤回时间窗口：发送后 2 分钟内可由发送者本人撤回
REVOKE_WINDOW_SECONDS = 120


async def revoke_message(
    db: AsyncSession,
    ticket: SupportTicket,
    message_id: str,
    user: User,
) -> SupportTicketOut:
    # 直接按 id 取消息，避免依赖传入对象的懒加载关系
    result = await db.execute(
        select(SupportMessage).where(
            SupportMessage.id == message_id, SupportMessage.ticket_id == ticket.id
        )
    )
    msg = result.scalars().first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="消息不存在")

    # 仅发送者本人可撤回
    sender_role = SenderRole.MERCHANT if user.role == Role.MERCHANT else SenderRole.BUYER
    if msg.sender_role != sender_role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="只能撤回自己发送的消息")

    if msg.is_revoked:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="消息已撤回")

    # 2 分钟时间窗口校验
    if msg.created_at:
        created = msg.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - created).total_seconds()
        if elapsed > REVOKE_WINDOW_SECONDS:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅可在 2 分钟内撤回")

    msg.is_revoked = True
    msg.revoked_at = datetime.now(timezone.utc)
    msg.content = ""
    await db.commit()
    ticket = await _reload(db, ticket.id)
    return await _to_out(db, ticket, user.role.value)


async def close_ticket(db: AsyncSession, ticket: SupportTicket, user: User) -> SupportTicketOut:
    # 商家可关闭分配给自己的工单；买家可关闭自己发起的工单
    if user.role == Role.MERCHANT:
        if ticket.merchant_id and ticket.merchant_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权关闭该工单")
    elif user.role == Role.BUYER:
        if ticket.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权关闭该工单")
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权关闭该工单")
    ticket.status = TicketStatus.CLOSED
    # 知识库自学习：关闭时沉淀 买家首问 → 商家最新回答
    from app.services import knowledge_service

    await knowledge_service.learn_from_ticket(db, ticket, commit=False)
    await db.commit()
    ticket = await _reload(db, ticket.id)
    return await _to_out(db, ticket, user.role.value)


async def rate_ticket(
    db: AsyncSession, ticket: SupportTicket, user: User, rating: int, comment: str | None
) -> SupportTicketOut:
    if user.role != Role.BUYER or ticket.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="仅买家本人可评价")
    ticket.satisfaction_rating = rating
    ticket.satisfaction_comment = comment
    await db.commit()
    ticket = await _reload(db, ticket.id)
    return await _to_out(db, ticket, user.role.value)


async def delete_ticket(db: AsyncSession, ticket: SupportTicket, user: User) -> None:
    if user.role != Role.BUYER or ticket.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅买家本人可删除自己的工单",
        )
    await db.delete(ticket)
    await db.commit()


async def delete_tickets(db: AsyncSession, user: User, ids: list[str]) -> int:
    """批量删除买家自己的工单，仅删除属于当前用户的工单，返回删除数量。"""
    if user.role != Role.BUYER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅买家本人可删除工单",
        )
    if not ids:
        return 0
    result = await db.execute(
        select(SupportTicket).where(
            SupportTicket.id.in_(ids), SupportTicket.user_id == user.id
        )
    )
    tickets = result.scalars().all()
    for t in tickets:
        await db.delete(t)
    await db.commit()
    return len(tickets)


async def ai_draft_reply(db: AsyncSession, ticket: SupportTicket) -> str:
    """为商家生成回复草稿（不落库，由商家确认后发送）。"""
    product = await db.get(Product, ticket.product_id) if ticket.product_id else None
    # 取最近一条买家/AI 消息作为问题
    question = ""
    for m in reversed(ticket.messages):
        if m.sender_role in (SenderRole.BUYER, SenderRole.AI):
            question = m.content
            break
    if not question:
        question = ticket.subject or "您好，请问有什么可以帮您？"
    answer = await _ai_answer(db, question, product, ticket.merchant_id)
    return answer or "（暂无法生成 AI 建议回复，请人工回复）"
