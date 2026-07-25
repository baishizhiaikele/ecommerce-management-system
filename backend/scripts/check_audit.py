import asyncio

import httpx

BASE = "http://127.0.0.1:8000/api"


async def main():
    async with httpx.AsyncClient(base_url=BASE, timeout=20) as c:
        a = (await c.post("/auth/login", json={"username": "admin", "password": "admin123"})).json()["access_token"]
        h = {"Authorization": f"Bearer {a}"}
        logs = (await c.get("/admin/audit-logs", headers=h)).json()
        acts = sorted(set(l["action"] for l in logs))
        print("AUDIT ACTIONS:", acts)
        print("has review.create:", "review.create" in acts)
        print("has chat.message:", "chat.message" in acts)
        print("has user.update:", "user.update" in acts)
        prods = (await c.get("/products")).json()
        for p in prods:
            revs = (await c.get(f"/products/{p['id']}/reviews")).json()
            for r in revs:
                print("review", r["id"], "rating", r["rating"], "sentiment", r["sentiment"])


if __name__ == "__main__":
    asyncio.run(main())
