"""营销玩法服务（P3-C：秒杀防超卖 + 拼团 + 砍价）。

对齐 2026「即时零售/社交裂变」趋势：
- 秒杀：数据库层原子扣减 `stock_sold`，WHERE 条件保证不超卖。
- 拼团：成团后批量生成成员订单。
- 砍价：多人帮砍逐步触底，触底可下单。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, literal, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import Promotion, PromotionType
from app.models.marketing import (
    Bargain,
    BargainCut,
    BargainStatus,
    GroupBuy,
    GroupBuyMember,
    GroupBuyStatus,
)
from app.models.order import Order, OrderItem, OrderStatus
from app.models.product import Product
from app.models.user import User
from app.core.metrics import inc_counter


def _order_no() -> str:
    return f"NO{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:4].upper()}"


async def _create_direct_order(
    db: AsyncSession,
    user: User,
    product_id: str,
    price: float,
    quantity: int,
    address: str,
    title: str,
) -> Order:
    order = Order(
        order_no=_order_no(),
        buyer_id=user.id,
        status=OrderStatus.PENDING_PAYMENT,
        total_amount=float(price) * quantity,
        freight=0,
        address=address or "（未提供地址）",
    )
    db.add(order)
    await db.flush()
    item = OrderItem(
        order_id=order.id, product_id=product_id, quantity=quantity, price=float(price)
    )
    db.add(item)
    # 同步扣减商品库存（与秒杀库存独立，保证目录一致）
    p = await db.get(Product, product_id)
    if p:
        p.stock = max((p.stock or 0) - quantity, 0)
    return order


# ---------- 秒杀 ----------
async def join_flash(
    db: AsyncSession, promotion_id: str, user: User, quantity: int = 1, address: str = ""
) -> Order:
    # 原子扣减：仅当剩余库存充足时才更新成功（rowcount==1）
    stmt = (
        update(Promotion)
        .where(
            (Promotion.id == promotion_id)
            & (Promotion.type == PromotionType.FLASH)
            & (Promotion.stock_sold + literal(quantity) <= Promotion.stock_limit)
        )
        .values(stock_sold=Promotion.stock_sold + quantity)
    )
    res = await db.execute(stmt)
    if res.rowcount == 0:
        raise ValueError("秒杀已售罄")
    promo = await db.get(Promotion, promotion_id)
    order = await _create_direct_order(
        db, user, promo.product_id, float(promo.discount_price), quantity, address, promo.title
    )
    await db.commit()
    await db.refresh(order)
    return order


# ---------- 拼团 ----------
async def create_group(
    db: AsyncSession,
    product_id: str,
    user: User,
    price: float,
    required_size: int,
    address: str = "",
    title: str | None = None,
) -> GroupBuy:
    gb = GroupBuy(
        product_id=product_id,
        initiator_id=user.id,
        price=float(price),
        required_size=max(required_size, 2),
        current_size=1,
        status=GroupBuyStatus.OPEN.value,
        title=title or "拼团",
    )
    db.add(gb)
    await db.flush()
    inc_counter("marketing_groups_created")
    db.add(GroupBuyMember(group_id=gb.id, user_id=user.id, address=address))
    await db.commit()
    await db.refresh(gb)
    return gb


async def join_group(db: AsyncSession, group_id: str, user: User, address: str = "") -> GroupBuy:
    gb = await db.get(GroupBuy, group_id)
    if not gb:
        raise ValueError("拼团不存在")
    if gb.status != GroupBuyStatus.OPEN.value:
        raise ValueError("拼团已结束")
    dup = await db.scalar(
        select(GroupBuyMember).where(
            (GroupBuyMember.group_id == group_id) & (GroupBuyMember.user_id == user.id)
        )
    )
    if dup:
        raise ValueError("你已参与该拼团")
    db.add(GroupBuyMember(group_id=group_id, user_id=user.id, address=address))
    gb.current_size += 1
    if gb.current_size >= gb.required_size:
        gb.status = GroupBuyStatus.COMPLETED.value
        members = list(await db.scalars(select(GroupBuyMember).where(GroupBuyMember.group_id == group_id)))
        for mem in members:
            mem_user = await db.get(User, mem.user_id)
            order = await _create_direct_order(
                db, mem_user, gb.product_id, float(gb.price), 1, mem.address or "", gb.title or "拼团"
            )
            mem.order_id = order.id
    await db.commit()
    await db.refresh(gb)
    return gb


# ---------- 砍价 ----------
async def create_bargain(
    db: AsyncSession,
    product_id: str,
    user: User,
    origin_price: float,
    floor_price: float,
) -> Bargain:
    b = Bargain(
        product_id=product_id,
        initiator_id=user.id,
        origin_price=float(origin_price),
        floor_price=float(floor_price),
        current_price=float(origin_price),
        status=BargainStatus.ACTIVE.value,
    )
    db.add(b)
    await db.commit()
    await db.refresh(b)
    inc_counter("marketing_bargains_created")
    return b


async def cut_bargain(db: AsyncSession, bargain_id: str, user: User, address: str = "") -> Bargain:
    b = await db.get(Bargain, bargain_id)
    if not b:
        raise ValueError("砍价活动不存在")
    if b.status != BargainStatus.ACTIVE.value:
        raise ValueError("砍价已结束")
    # 助力防刷：同一用户对同一砍价最多帮砍 3 刀（鼓励分享裂变，但防止单人刷量）
    cut_count = await db.scalar(
        select(func.count(BargainCut.id)).where(
            (BargainCut.bargain_id == bargain_id) & (BargainCut.user_id == user.id)
        )
    )
    if cut_count and int(cut_count) >= 3:
        raise ValueError("你已帮砍过该活动（最多 3 刀）")
    if float(b.current_price) <= float(b.floor_price):
        raise ValueError("已砍到底价")
    # 每次砍掉总差价的 25%（保证有限次内触底），且不低于 0.01
    total_gap = float(b.origin_price) - float(b.floor_price)
    amount = round(max(0.01, total_gap * 0.25), 2)
    new_price = round(float(b.current_price) - amount, 2)
    if new_price < float(b.floor_price):
        new_price = float(b.floor_price)
    db.add(BargainCut(bargain_id=b.id, user_id=user.id, amount=amount))
    b.current_price = new_price
    if new_price <= float(b.floor_price):
        b.status = BargainStatus.LOCKED.value
    await db.commit()
    await db.refresh(b)
    return b


async def buy_bargain(db: AsyncSession, bargain_id: str, user: User, address: str = "") -> Order:
    b = await db.get(Bargain, bargain_id)
    if not b:
        raise ValueError("砍价活动不存在")
    if b.status != BargainStatus.LOCKED.value:
        raise ValueError("请先砍到底价")
    order = await _create_direct_order(
        db, user, b.product_id, float(b.current_price), 1, address, "砍价"
    )
    b.status = BargainStatus.COMPLETED.value
    await db.commit()
    await db.refresh(order)
    return order


GROUP_TTL_HOURS = 24  # 拼团成团时限（小时）


async def expire_groups(db: AsyncSession, *, now: datetime | None = None) -> int:
    """P2-1 拼团成团超时自动退款：扫描已超时（创建超过 TTL）仍未成团的 OPEN 团，
    将成员订单取消并解散拼团（返回处理数量）。"""
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=GROUP_TTL_HOURS)
    # OPEN 且创建时间早于截止点（视为超时未成团）
    groups = list(
        await db.scalars(
            select(GroupBuy)
            .where(GroupBuy.status == GroupBuyStatus.OPEN.value)
            .where(GroupBuy.created_at < cutoff)
        )
    )
    processed = 0
    for g in groups:
        # 当前设计为「成团后才生成成员订单」，未成团超时无需退款，
        # 直接解散拼团即可；若后续改为「参团即下单」，此处可补退款逻辑。
        g.status = GroupBuyStatus.FAILED.value
        db.add(g)
        processed += 1
    if processed:
        await db.commit()
    return processed
