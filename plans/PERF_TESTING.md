# 性能压测与 PostgreSQL 生产切换（T15）

> 状态：后端已支持 PostgreSQL（无需改代码）。本文件记录切换步骤与并发压测方法。

## 一、切换到 PostgreSQL（生产）

后端通过 `Settings.async_database_url` 自动识别连接串：
- `postgresql://...` → 自动转为 `postgresql+asyncpg://...`（异步驱动）
- 兼容 Render 等平台提供的 `sslmode=require`（`sslmode=require` → `ssl=true`）

**部署时只需设置环境变量 `DATABASE_URL` 为 PG 连接串**，无需改代码：

```bash
# 本地用 docker 起 PG
docker run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=ai_shop postgres:16
export DATABASE_URL="postgresql://postgres:dev@localhost:5432/ai_shop"
alembic upgrade head   # 迁移已普遍使用 batch_alter_table，兼容 PG
uvicorn app.main:app --reload
```

生产（Render/GitHub Actions）已通过 `render.yaml` 的 `fromDatabase.internalConnectionString` 注入，
且 `releaseCommand: alembic upgrade head` 保证每次部署自动迁移。

## 二、并发压测

### 高频只读接口（首页/榜单/分类/推荐/相似推荐）
这些接口均带缓存（Redis 或进程内降级），压测重点验证缓存命中率：

```bash
pip install locust
locust -f tests/load/home.py --headless -u 200 -r 20 -t 2m
```

`tests/load/home.py` 示例：

```python
from locust import HttpUser, task, between

class ShopUser(HttpUser):
    wait_time = between(0.5, 2)
    @task(5)
    def home(self):
        self.client.get("/api/products?page=1&page_size=20")
    @task(3)
    def hot(self):
        self.client.get("/api/recommendations/hot")
    @task(2)
    def boards(self):
        self.client.get("/api/products?sort=sales&page_size=10")
```

### 写链路（加购/下单）
```bash
locust -f tests/load/order.py --headless -u 50 -r 5 -t 1m
```

### 关键指标
- p95 延迟：只读接口 < 80ms（命中缓存），写接口 < 300ms
- 错误率：< 0.5%
- 缓存命中率：首页聚合 > 90%（Redis 命中）

## 三、注意事项
- SQLite 不支持真正的并发写；压测并发写务必使用 PostgreSQL。
- PG 下 `Numeric` 金额字段已定点化（迁移 0013），避免浮点误差。
- 压测前确认 `REDIS_URL` 已配置（无则降级进程内缓存，单机有效、多实例无效）。
