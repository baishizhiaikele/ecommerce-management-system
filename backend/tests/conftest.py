"""
pytest 全局夹具。

关键设计：
- 在导入任何 app 模块之前，将 DATABASE_URL 指向独立的测试库文件，
  确保全局 async engine（app.db.session.engine）绑定到测试库而非开发库。
- 所有异步夹具与用例统一使用 session 级事件循环（见 pytest.ini），
  避免 SQLAlchemy async engine 跨事件循环导致的 "attached to a different loop" 错误。
- 直接用 httpx.ASGITransport 在进程内驱动 FastAPI app，无需启动外部服务器。
"""
import os
import pathlib

# 必须在导入 app 之前设置，settings/engine 会在首次 import 时读取该值。
_TEST_DB_PATH = pathlib.Path(__file__).resolve().parent / "test_ai_shop.db"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TEST_DB_PATH.as_posix()}"

import httpx  # noqa: E402
import pytest_asyncio  # noqa: E402

from app.core.seed import seed_demo  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import engine  # noqa: E402
from app.events_handlers import register_handlers  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _prepare_database():
    """整个测试会话开始前：重建干净的测试库并写入演示数据。"""
    if _TEST_DB_PATH.exists():
        _TEST_DB_PATH.unlink()

    register_handlers()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await seed_demo()

    yield

    await engine.dispose()
    if _TEST_DB_PATH.exists():
        try:
            _TEST_DB_PATH.unlink()
        except PermissionError:
            pass


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


async def _login(client: "httpx.AsyncClient", username: str, password: str) -> dict:
    r = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def buyer_headers(client):
    tok = await _login(client, "buyer", "buyer123")
    return {"Authorization": f"Bearer {tok['access_token']}"}


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def merchant_headers(client):
    tok = await _login(client, "merchant", "merchant123")
    return {"Authorization": f"Bearer {tok['access_token']}"}


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def admin_headers(client):
    tok = await _login(client, "admin", "admin123")
    return {"Authorization": f"Bearer {tok['access_token']}"}
