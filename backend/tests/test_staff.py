"""子账号权限：创建 / 权限矩阵 / 登录操作 / 权限拦截 / 停用。"""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def _login(client, username, password):
    r = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def test_subaccount_flow(client, merchant_headers):
    # 1) 创建拥有 products 权限的子账号
    r = await client.post(
        "/api/subaccounts",
        json={"username": "staffalpha", "password": "staff123", "permissions": ["products", "orders"]},
        headers=merchant_headers,
    )
    assert r.status_code == 200, r.text
    sub = r.json()
    assert sub["username"] == "staffalpha"
    assert set(sub["permissions"]) == {"products", "orders"}

    # 2) 列表
    r = await client.get("/api/subaccounts/mine", headers=merchant_headers)
    assert r.status_code == 200
    assert len(r.json()) == 1

    # 3) 子账号登录，创建商品（应归属店主）
    sh = await _login(client, "staffalpha", "staff123")
    p = await client.post(
        "/api/products",
        json={"name": "子账号商品", "price": 88, "stock": 3, "category_id": None},
        headers=sh,
    )
    assert p.status_code == 201, p.text
    owner_merchant_id = p.json()["merchant_id"]

    # 4) 仅 orders 权限的子账号无法创建商品（403）
    r = await client.post(
        "/api/subaccounts",
        json={"username": "staffbeta", "password": "staff123", "permissions": ["orders"]},
        headers=merchant_headers,
    )
    assert r.status_code == 200
    bh = await _login(client, "staffbeta", "staff123")
    denied = await client.post(
        "/api/products",
        json={"name": "越权商品", "price": 10, "stock": 1, "category_id": None},
        headers=bh,
    )
    assert denied.status_code == 403, denied.text

    # 5) 店主创建的普通商品，merchant_id 与子账号创建的应一致
    mp = await client.post(
        "/api/products",
        json={"name": "店主商品", "price": 50, "stock": 1, "category_id": None},
        headers=merchant_headers,
    )
    assert mp.json()["merchant_id"] == owner_merchant_id

    # 6) 更新权限 / 停用
    sub_id = sub["id"]
    r = await client.put(
        f"/api/subaccounts/{sub_id}",
        json={"permissions": ["orders"], "is_active": False},
        headers=merchant_headers,
    )
    assert r.status_code == 200
    assert r.json()["is_active"] is False

    # 停用后该账号不再是有效子账号，无法再以店主身份操作其商品（403）
    sh2 = await _login(client, "staffalpha", "staff123")
    owner_pid = mp.json()["id"]
    blocked = await client.put(f"/api/products/{owner_pid}", json={}, headers=sh2)
    assert blocked.status_code == 403, blocked.text

    # 7) 删除
    r = await client.delete(f"/api/subaccounts/{sub_id}", headers=merchant_headers)
    assert r.status_code == 200
    r = await client.get("/api/subaccounts/mine", headers=merchant_headers)
    assert len(r.json()) == 1  # staffbeta 仍在
