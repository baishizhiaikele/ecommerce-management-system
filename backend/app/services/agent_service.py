"""AI 可行动代理层（P3-B：Agentic Commerce）。

对齐 2026「AI 购物助手 / 可行动代理」趋势：代理不只是推荐，而是能**调用工具**
完成真实操作（查库存、比价、凑单、加购、下单）。

设计要点：
- 工具以注册表（TOOLS）声明，含自然语言描述，便于未来接 LLM function-calling。
- `agent_chat` 走关键词意图识别（无需外部 LLM 也可演示），也可由前端直接指定 `tool` 精确调用。
- 所有工具调用都基于真实服务/模型，并回写审计。
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cart import CartItem
from app.models.product import Product, ProductStatus
from app.models.shipping import ShippingTemplate
from app.models.user import User
from app.services import order_service
from app.services.audit_service import record


# ---------- 工具实现 ----------
async def tool_check_stock(db: AsyncSession, product_id: str) -> dict:
    p = await db.get(Product, product_id)
    if not p:
        raise ValueError("商品不存在")
    return {
        "product_id": product_id,
        "name": p.name,
        "stock": p.stock,
        "status": p.status,
        "available": p.status == ProductStatus.ACTIVE and p.stock > 0,
    }


async def tool_compare_price(db: AsyncSession, product_id: str) -> dict:
    p = await db.get(Product, product_id)
    if not p:
        raise ValueError("商品不存在")
    market_avg = await db.scalar(
        select(func.avg(Product.price)).where(
            (Product.category_id == p.category_id) & (Product.status == ProductStatus.ACTIVE)
        )
    )
    avg = float(market_avg or p.price)
    return {
        "product_id": product_id,
        "name": p.name,
        "price": float(p.price),
        "category_avg": round(avg, 2),
        "delta_pct": round((float(p.price) - avg) / avg * 100, 1) if avg else 0,
        "verdict": "高于均价" if float(p.price) > avg else "低于或等于均价",
    }


async def tool_bundle_recommend(db: AsyncSession, user: User) -> dict:
    rows = list(await db.scalars(select(CartItem).where(CartItem.user_id == user.id)))
    total = 0.0
    for it in rows:
        p = await db.get(Product, it.product_id)
        if p:
            total += float(p.price) * it.quantity
    tmpl = (
        await db.scalars(
            select(ShippingTemplate).where(ShippingTemplate.is_default == True)  # noqa: E712
        )
    ).first()
    free_amount = float(tmpl.free_amount) if tmpl and tmpl.free_amount else 0
    gap = round(max(free_amount - total, 0), 2)
    return {
        "cart_total": round(total, 2),
        "free_shipping_threshold": free_amount,
        "gap_to_free_shipping": gap,
        "suggestion": (
            f"再买 ¥{gap} 即可免运费" if gap > 0 else "已满足免运费门槛"
        ),
    }


async def tool_add_to_cart(
    db: AsyncSession, user: User, product_id: str, quantity: int = 1
) -> dict:
    p = await db.get(Product, product_id)
    if not p or p.status != ProductStatus.ACTIVE:
        raise ValueError("商品不可购买")
    if p.stock < quantity:
        raise ValueError("库存不足")
    existing = await db.scalar(
        select(CartItem).where(
            (CartItem.user_id == user.id) & (CartItem.product_id == product_id)
        )
    )
    if existing:
        existing.quantity = min(existing.quantity + quantity, 99)
        item = existing
    else:
        item = CartItem(user_id=user.id, product_id=product_id, quantity=quantity)
        db.add(item)
    await record(db, user.id, "agent.add_to_cart", "cart", product_id, f"代理加购 {product_id} x{quantity}")
    await db.commit()
    await db.refresh(item)
    return {"product_id": product_id, "quantity": item.quantity, "added": True}


async def tool_checkout(db: AsyncSession, user: User, address: str) -> dict:
    order = await order_service.checkout(db, buyer=user, address=address)
    await record(db, user.id, "agent.checkout", "order", order.id, "代理下单")
    return {
        "order_id": order.id,
        "order_no": order.order_no,
        "total_amount": float(order.total_amount),
        "status": order.status.value if hasattr(order.status, "value") else str(order.status),
    }


# ---------- 工具注册表 ----------
TOOLS: dict[str, dict[str, Any]] = {
    "check_stock": {
        "fn": tool_check_stock,
        "description": "查询指定商品的实时库存与可售状态",
        "params": {"product_id": "商品ID"},
    },
    "compare_price": {
        "fn": tool_compare_price,
        "description": "对比该商品与同品类均价，给出贵/便宜判定",
        "params": {"product_id": "商品ID"},
    },
    "bundle_recommend": {
        "fn": tool_bundle_recommend,
        "description": "基于购物车金额，给出凑单/免运费建议",
        "params": {},
    },
    "add_to_cart": {
        "fn": tool_add_to_cart,
        "description": "把商品加入购物车（代理代操作）",
        "params": {"product_id": "商品ID", "quantity": "数量(默认1)"},
    },
    "checkout": {
        "fn": tool_checkout,
        "description": "用购物车一键下单并创建待支付订单",
        "params": {"address": "收货地址"},
    },
}


def list_tools() -> list[dict]:
    return [
        {"name": n, "description": v["description"], "params": v["params"]}
        for n, v in TOOLS.items()
    ]


# ---------- 意图识别（轻量关键词路由，无需外部 LLM） ----------
def route_intent(message: str) -> str | None:
    m = (message or "").lower()
    if any(k in m for k in ("库存", "有货", "stock", "还有吗")):
        return "check_stock"
    if any(k in m for k in ("比价", "价格", "贵", "便宜", "compare", "price")):
        return "compare_price"
    if any(k in m for k in ("凑单", "满减", "免运费", "bundle", "还差")):
        return "bundle_recommend"
    if any(k in m for k in ("加购", "加入购物车", "add to cart", "帮我买")):
        return "add_to_cart"
    if any(k in m for k in ("下单", "结算", "checkout", "付款", "拍下")):
        return "checkout"
    return None


async def agent_chat(
    db: AsyncSession,
    user: User,
    message: str,
    product_id: str | None = None,
    address: str | None = None,
    tool: str | None = None,
) -> dict:
    """解析用户意图并调用对应工具，返回自然语言回复 + 结构化调用记录。"""
    chosen = tool or route_intent(message)
    if not chosen or chosen not in TOOLS:
        return {
            "reply": "我可以帮你查库存、比价、凑单、加购或下单，请告诉我你想做什么～",
            "tool_calls": [],
        }
    spec = TOOLS[chosen]
    fn = spec["fn"]
    calls: list[dict] = []

    # 需要 product_id 的工具：从显式参数或消息里提取
    if chosen in ("check_stock", "compare_price", "add_to_cart") and not product_id:
        import re

        m = re.search(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", message)
        if m:
            product_id = m.group(0)

    if chosen == "check_stock":
        data = await fn(db, product_id)
    elif chosen == "compare_price":
        data = await fn(db, product_id)
    elif chosen == "bundle_recommend":
        data = await fn(db, user)
    elif chosen == "add_to_cart":
        data = await fn(db, user, product_id, 1)
    else:  # checkout
        data = await fn(db, user, address or "（未提供地址）")
    calls.append({"tool": chosen, "result": data})

    reply = _render_reply(chosen, data)
    return {"reply": reply, "tool_calls": calls, "intent": chosen}


def _render_reply(tool: str, data: dict) -> str:
    if tool == "check_stock":
        return f"「{data['name']}」当前库存 {data['stock']} 件，" + (
            "可正常下单。" if data["available"] else "暂不可售。"
        )
    if tool == "compare_price":
        return (
            f"「{data['name']}」售价 ¥{data['price']}，同品类均价 ¥{data['category_avg']}，"
            f"{data['verdict']}（{data['delta_pct']}%）。"
        )
    if tool == "bundle_recommend":
        return f"购物车合计 ¥{data['cart_total']}，{data['suggestion']}。"
    if tool == "add_to_cart":
        return f"已为你加入购物车（数量 {data['quantity']}）。"
    if tool == "checkout":
        return f"已下单：订单号 {data['order_no']}，应付 ¥{data['total_amount']}。"
    return "已完成操作。"
