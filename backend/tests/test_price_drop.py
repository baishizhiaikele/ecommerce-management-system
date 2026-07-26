"""降价提醒：收藏商品降价后，收藏用户收到 PRICE_DROP 通知。"""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _merchant_product_id(client, merchant_headers: dict) -> str:
    me = await client.get("/api/auth/me", headers=merchant_headers)
    mid = me.json()["id"]
    prods = await client.get(f"/api/products?merchant_id={mid}")
    return prods.json()[0]["id"]


async def test_price_drop_notifies_favorited_buyer(client, buyer_headers, merchant_headers):
    pid = await _merchant_product_id(client, merchant_headers)

    # 买家收藏该商品
    fav = await client.post(f"/api/favorites/{pid}", headers=buyer_headers)
    assert fav.status_code in (200, 201), fav.text

    # 取当前价并降价
    prod = (await client.get(f"/api/products/{pid}")).json()
    old_price = prod["price"]
    new_price = round(float(old_price) - 1.0, 2)
    upd = await client.put(f"/api/products/{pid}", json={"price": new_price}, headers=merchant_headers)
    assert upd.status_code == 200, upd.text

    # 买家应收到降价通知
    notifs = (await client.get("/api/notifications", headers=buyer_headers)).json()
    assert any(n["type"] == "price_drop" for n in notifs), notifs
