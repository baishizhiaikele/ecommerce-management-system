"""P12：覆盖核心安全/鉴权逻辑——HttpOnly Cookie 鉴权、刷新轮换、登出吊销。"""
import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_login_sets_httponly_cookie_and_me(client):
    r = await client.post("/api/auth/login", json={"username": "buyer", "password": "buyer123"})
    assert r.status_code == 200
    set_cookie = r.headers.get("set-cookie", "")
    assert "access_token" in set_cookie
    assert "httponly" in set_cookie.lower()

    # 同一 client 后续请求自动携带 Cookie，/auth/me 应识别用户
    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "buyer"


async def test_refresh_rotates_and_logout_revokes(client):
    await client.post("/api/auth/login", json={"username": "buyer", "password": "buyer123"})
    assert (await client.post("/api/auth/refresh")).status_code == 200

    # 登出提升 token_version，刷新令牌立即失效
    assert (await client.post("/api/auth/logout")).status_code == 204
    assert (await client.post("/api/auth/refresh")).status_code == 401
