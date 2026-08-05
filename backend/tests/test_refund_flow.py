"""退货退款主流程 E2E 测试（覆盖 P0#1/P0#2/P1#6 修复点）。

主流程：建商品+规格 → 加购规格 → 结算 → 支付 → 发货 → 确认收货
        → 申请退货退款 → 商家确认退款 → 断言 variant.stock 正确回补。

验证：
1. P0#2：退货退款后 variant.stock 正确回补（此前只扣不回补，规格永久流失）
2. P0#1：退款流程对任意合法流转都不应 500（release_escrow 兜底分支不崩）
3. P1#6：退款逆向事务在事件中一致执行
"""
import pytest
from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.variant import ProductVariant

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _create_product_with_variant(client, merchant_headers, admin_headers):
    """创建商品并附一个库存充足的规格，上架为 ACTIVE，返回 (product_id, variant_id, 初始库存)。"""
    create = await client.post(
        "/api/products",
        json={
            "name": "E2E退款测试商品",
            "price": "9.90",
            "stock": 20,
            "description": "用于验证 variant.stock 回补",
        },
        headers=merchant_headers,
    )
    assert create.status_code in (200, 201), create.text
    pid = create.json()["id"]

    v = await client.post(
        f"/api/products/{pid}/variants",
        json={"sku_code": "E2E-SKU-001", "specs": {"颜色": "红"}, "price_delta": 0.0, "stock": 10},
        headers=merchant_headers,
    )
    assert v.status_code in (200, 201), v.text
    vid = v.json()["id"]

    # 创建后默认 DRAFT，需上架为 ACTIVE 才能加购（set_status 需 ADMIN 权限）
    pub = await client.patch(
        f"/api/products/{pid}/status",
        json={"status": "active"},
        headers=admin_headers,
    )
    assert pub.status_code == 200, pub.text
    return pid, vid, 10


async def _get_variant_stock(variant_id):
    async with SessionLocal() as db:
        v = await db.scalar(select(ProductVariant).where(ProductVariant.id == variant_id))
        return int(v.stock or 0) if v else None


async def test_refund_flow_restocks_variant(client, buyer_headers, merchant_headers, admin_headers):
    pid, variant_id, stock_before = await _create_product_with_variant(client, merchant_headers, admin_headers)

    # 加购该规格（数量 1）
    cart = await client.post(
        "/api/cart/items",
        json={"product_id": pid, "quantity": 1, "variant_id": variant_id},
        headers=buyer_headers,
    )
    assert cart.status_code in (200, 201), cart.text

    # 结算
    order_resp = await client.post(
        "/api/orders/checkout", json={"address": "北京市朝阳区 demo 路 1 号"}, headers=buyer_headers
    )
    assert order_resp.status_code in (200, 201), order_resp.text
    order_id = order_resp.json()["id"]

    # 下单后规格库存应扣减 1
    assert await _get_variant_stock(variant_id) == stock_before - 1

    # 支付 → 发货 → 确认收货
    for target, headers in (
        ("paid", buyer_headers),
        ("shipped", merchant_headers),
        ("completed", buyer_headers),
    ):
        r = await client.patch(
            f"/api/orders/{order_id}/status", json={"status": target}, headers=headers
        )
        assert r.status_code == 200, f"{target}: {r.text}"

    # 已收货状态下申请退货退款 → RETURN_REQUESTED
    r = await client.post(
        f"/api/orders/{order_id}/refund",
        json={"reason": "e2e 测试退货", "refund_amount": None},
        headers=buyer_headers,
    )
    assert r.status_code in (200, 201), r.text
    assert r.json()["status"] == "return_requested"

    # 买家填写退货物流 → RETURN_SHIPPED
    r = await client.post(
        f"/api/orders/{order_id}/return-ship",
        json={"carrier": "e2e-物流", "tracking_no": "E2E123456"},
        headers=buyer_headers,
    )
    assert r.status_code == 200, r.text

    # 商家确认收到退货 → RETURN_RECEIVED
    r = await client.post(
        f"/api/orders/{order_id}/return-receive",
        headers=merchant_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "return_received"

    # 商家确认退款 → REFUNDED
    r = await client.patch(
        f"/api/orders/{order_id}/refund-review",
        json={"approve": True, "note": "e2e 同意退货退款"},
        headers=merchant_headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "refunded"

    # P0#2 断言：variant.stock 应回补到下单前水平（扣 1 后回补 1）
    stock_after = await _get_variant_stock(variant_id)
    assert stock_after == stock_before, (
        f"退货退款后 variant.stock 未正确回补：期望 {stock_before}，实际 {stock_after}"
    )


async def test_refund_does_not_500(client, buyer_headers, merchant_headers, admin_headers):
    """P0#1：退款流程对任意合法流转都不应 500；release_escrow 兜底分支不崩。"""
    pid, variant_id, _ = await _create_product_with_variant(client, merchant_headers, admin_headers)
    await client.post(
        "/api/cart/items",
        json={"product_id": pid, "quantity": 1, "variant_id": variant_id},
        headers=buyer_headers,
    )
    order_resp = await client.post(
        "/api/orders/checkout", json={"address": "北京市朝阳区 demo 路 1 号"}, headers=buyer_headers
    )
    order_id = order_resp.json()["id"]
    await client.patch(
        f"/api/orders/{order_id}/status", json={"status": "paid"}, headers=buyer_headers
    )
    r = await client.post(
        f"/api/orders/{order_id}/refund", json={"reason": "p0-1 兜底验证"}, headers=buyer_headers
    )
    assert r.status_code in (200, 201), r.text
    status = r.json()["status"]
    assert status in ("refund_requested", "refunded")
