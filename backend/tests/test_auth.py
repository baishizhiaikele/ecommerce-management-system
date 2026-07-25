"""认证与令牌生命周期测试：登录 / 刷新轮换 / me / 登出吊销 / 无效令牌。"""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_login_returns_token_pair(client):
    r = await client.post("/api/auth/login", json={"username": "buyer", "password": "buyer123"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("access_token")
    assert data.get("refresh_token")


async def test_login_wrong_password_rejected(client):
    r = await client.post("/api/auth/login", json={"username": "buyer", "password": "wrong-pass"})
    assert r.status_code == 401


async def test_refresh_and_logout_revokes(client):
    """刷新可换新令牌；登出提升 token_version 后旧 refresh 失效。"""
    login = (await client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})).json()

    r2 = await client.post("/api/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert r2.status_code == 200, r2.text
    refreshed = r2.json()

    # 新 access 可访问受保护资源
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {refreshed['access_token']}"})
    assert me.status_code == 200
    assert me.json().get("username") == "admin"

    # 登出吊销：token_version+1
    lo = await client.post("/api/auth/logout", headers={"Authorization": f"Bearer {refreshed['access_token']}"})
    assert lo.status_code == 204, lo.text

    # 吊销后旧 refresh 失效
    after = await client.post("/api/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert after.status_code == 401, after.text


async def test_me_requires_auth(client):
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_invalid_token_rejected(client):
    r = await client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401


async def test_refresh_token_cannot_be_used_as_access(client):
    """refresh 令牌不能当作 access 访问受保护接口。"""
    login = (await client.post("/api/auth/login", json={"username": "buyer", "password": "buyer123"})).json()
    r = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {login['refresh_token']}"})
    assert r.status_code == 401
