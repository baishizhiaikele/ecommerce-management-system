import asyncio
import json

import httpx

BASE = "http://127.0.0.1:8000/api"


async def main():
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        # 登录（双令牌）
        r = await c.post("/auth/login", json={"username": "buyer", "password": "buyer123"})
        assert r.status_code == 200, r.text
        tok = r.json()
        assert "access_token" in tok and "refresh_token" in tok, tok
        print("login OK, has access+refresh:", bool(tok.get("refresh_token")))

        # 用 refresh 换发新令牌（轮换）
        r2 = await c.post("/auth/refresh", json={"refresh_token": tok["refresh_token"]})
        assert r2.status_code == 200, r2.text
        tok2 = r2.json()
        assert tok2["refresh_token"] != tok["refresh_token"], "refresh 应轮换出新令牌"
        print("refresh OK (rotated):", tok2["refresh_token"][:12], "!=", tok["refresh_token"][:12])

        # 用新 access 访问受保护资源
        me = await c.get("/auth/me", headers={"Authorization": f"Bearer {tok2['access_token']}"})
        assert me.status_code == 200, me.text
        print("me OK:", me.json().get("username"))

        # 退出登录（吊销 refresh）
        lo = await c.post("/auth/logout", headers={"Authorization": f"Bearer {tok2['access_token']}"})
        assert lo.status_code == 204, lo.text
        print("logout OK (204)")

        # 旧 refresh 令牌应已失效
        r3 = await c.post("/auth/refresh", json={"refresh_token": tok["refresh_token"]})
        print("old refresh after logout status:", r3.status_code)
        assert r3.status_code == 401, "吊销后旧 refresh 必须失效"
        r4 = await c.post("/auth/refresh", json={"refresh_token": tok2["refresh_token"]})
        print("rotated refresh after logout status:", r4.status_code)
        assert r4.status_code == 401, "吊销后轮换出的 refresh 必须失效"
        print("revocation OK")

        # 审计：登录应被记录（admin 查询）
        ar = await c.post("/auth/login", json={"username": "admin", "password": "admin123"})
        ad = ar.json()["access_token"]
        logs = await c.get("/admin/audit-logs", headers={"Authorization": f"Bearer {ad}"})
        actions = [l["action"] for l in logs.json()]
        print("audit actions sample:", sorted(set(actions)))
        for need in ("login", "logout", "review.create", "chat.message", "cart.add", "order.checkout"):
            print(f"  audit has {need}:", need in actions)

    print("AUTH_FLOW_OK")


if __name__ == "__main__":
    asyncio.run(main())
