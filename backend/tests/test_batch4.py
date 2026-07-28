"""批次 4 测试：退款自动审核 / 电子发票 / 预售定金。"""
import pytest

from app.db.session import SessionLocal
from app.models.product import Product, ProductStatus

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _register(client, name: str) -> dict:
    r = await client.post(
        "/api/auth/register",
        json={"username": name, "email": f"{name}@e.com", "password": "Test1234", "role": "buyer"},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def _make_product(client, mh, name, price=10, stock=50) -> str:
    r = await client.post(
        "/api/products",
        headers=mh,
        json={"name": name, "price": price, "stock": stock, "category_id": None},
    )
    pid = r.json()["id"]
    async with SessionLocal() as s:
        p = await s.get(Product, pid)
        p.status = ProductStatus.ACTIVE
        await s.commit()
    return pid


async def _buy(client, headers, pid, qty=1, pay=True):
    await client.post("/api/cart/items", json={"product_id": pid, "quantity": qty}, headers=headers)
    r = await client.post(
        "/api/orders/checkout", json={"address": "批次四测试收货地址"}, headers=headers
    )
    order = r.json()
    if pay:
        await client.patch(
            f"/api/orders/{order['id']}/status", json={"status": "paid"}, headers=headers
        )
    return order


async def test_auto_refund_small_amount(client, merchant_headers):
    buyer = await _register(client, "b4_auto_refund")
    pid = await _make_product(client, merchant_headers, "小额自动退款商品", price=10)
    order = await _buy(client, buyer, pid)

    # 小额（10 元 < 100 元阈值）仅退款 → 自动秒退
    r = await client.post(
        f"/api/orders/{order['id']}/refund",
        json={"reason": "不想要了"},
        headers=buyer,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "refunded"


async def test_auto_refund_large_amount_stays_manual(client, merchant_headers):
    buyer = await _register(client, "b4_manual_refund")
    pid = await _make_product(client, merchant_headers, "大额人工退款商品", price=500)
    order = await _buy(client, buyer, pid)

    r = await client.post(
        f"/api/orders/{order['id']}/refund",
        json={"reason": "拍错了"},
        headers=buyer,
    )
    assert r.status_code == 200
    # 超过阈值：保持人工审核队列
    assert r.json()["status"] == "refund_requested"


async def test_invoice_flow(client, merchant_headers):
    buyer = await _register(client, "b4_invoice")
    pid = await _make_product(client, merchant_headers, "开票测试商品", price=30)
    order = await _buy(client, buyer, pid)

    # 企业抬头缺税号被拒
    r = await client.post(
        f"/api/invoices/orders/{order['id']}",
        json={"title_type": "company", "title": "某某科技有限公司"},
        headers=buyer,
    )
    assert r.status_code == 400

    r = await client.post(
        f"/api/invoices/orders/{order['id']}",
        json={"title_type": "company", "title": "某某科技有限公司", "tax_no": "91110000TEST001"},
        headers=buyer,
    )
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["invoice_no"].startswith("INV")
    assert inv["amount"] > 0

    # 重复开票被拒
    r = await client.post(
        f"/api/invoices/orders/{order['id']}",
        json={"title_type": "personal", "title": "个人"},
        headers=buyer,
    )
    assert r.status_code == 400

    mine = (await client.get("/api/invoices/mine", headers=buyer)).json()
    assert any(i["id"] == inv["id"] for i in mine)


async def test_presale_flow(client, merchant_headers):
    buyer = await _register(client, "b4_presale")
    pid = await _make_product(client, merchant_headers, "预售新品", price=200, stock=10)

    # 定金抵扣超过预售价被拒
    r = await client.post(
        "/api/presales",
        headers=merchant_headers,
        json={
            "product_id": pid,
            "title": "坏预售",
            "presale_price": 100,
            "deposit": 80,
            "inflate_rate": 2.0,
        },
    )
    assert r.status_code == 400

    # 预售价 180，定金 20 膨胀 1.5 抵 30，尾款 150
    r = await client.post(
        "/api/presales",
        headers=merchant_headers,
        json={
            "product_id": pid,
            "title": "新品预售抢先购",
            "presale_price": 180,
            "deposit": 20,
            "inflate_rate": 1.5,
        },
    )
    assert r.status_code == 201, r.text
    presale = r.json()
    assert abs(presale["deposit_deduction"] - 30.0) < 0.01
    assert abs(presale["balance_due"] - 150.0) < 0.01

    # 买家付定金
    r = await client.post(f"/api/presales/{presale['id']}/deposit", headers=buyer)
    assert r.status_code == 201, r.text
    resv = r.json()
    assert resv["status"] == "deposit_paid"

    # 重复付定金被拒
    r = await client.post(f"/api/presales/{presale['id']}/deposit", headers=buyer)
    assert r.status_code == 400

    # 付尾款 → 生成已支付订单
    r = await client.post(
        f"/api/presales/reservations/{resv['id']}/balance",
        json={"address": "预售测试收货地址"},
        headers=buyer,
    )
    assert r.status_code == 200, r.text
    done = r.json()
    assert done["status"] == "completed"
    assert done["order_id"]

    order = (await client.get(f"/api/orders/{done['order_id']}", headers=buyer)).json()
    assert order["status"] == "paid"
    # 实付 = 定金 20 + 尾款 150 = 170
    assert abs(float(order["total_amount"]) - 170.0) < 0.01
