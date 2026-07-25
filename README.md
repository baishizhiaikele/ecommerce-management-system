# AI 全托管小店（AI Managed Shop）

一个面向「想开店但不会运营的个人卖家」的全栈电商平台。电商为骨架，**AI 深度集成**为灵魂：
商家上传商品即可由 **AI 店长** 一键生成标题 / 卖点文案 / 定价建议，并由 **AI 智能客服** 自动接待咨询；
买家评价自动做 **情感分析** 并预警差评。完整覆盖认证、商品、购物车、订单状态机、RBAC、仪表板与审计日志。

## 技术栈

- 后端：FastAPI · SQLAlchemy 2.0(异步) · Pydantic V2 · JWT(bcrypt) · 事件总线
- 前端：React 18 · TypeScript · Vite · Ant Design 5 · Zustand · Tailwind · Recharts
- 数据库：开发 SQLite / 生产 PostgreSQL（同一 ORM）
- AI：OpenAI 兼容接口；无 key 时自动降级为本地确定性 mock，主流程不中断

## 快速开始

### 后端

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
cp .env.example .env                                 # 可选：填入 AI_API_KEY
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

启动后自动建表并写入演示账号，访问 http://localhost:8000/health 验证。

### 前端

```bash
cd frontend
npm install
npm run dev
```

前端默认 http://localhost:5173，已配置 `/api` 代理到后端 8000。

## 演示账号（占位，无真实个人信息）

| 角色 | 用户名 | 密码 |
|---|---|---|
| 买家 | buyer | buyer123 |
| 商家 | merchant | merchant123 |
| 管理员 | admin | admin123 |

## 角色与权限

- **buyer**：浏览、加购、下单、评价、AI 客服咨询
- **merchant**：商品管理、AI 店长、发货、商家数据看板
- **admin**：商品审核、用户管理、平台仪表板、审计日志

## 接口一览（前缀 `/api`）

| 模块 | 方法 & 路径 | 说明 |
|---|---|---|
| 认证 | POST /auth/register, /auth/login, /auth/refresh, GET /auth/me | 双令牌认证 |
| 分类 | GET /categories | 分类树 |
| 商品 | GET /products, GET /products/{id}, POST/PUT/DELETE /products | 商品 CRUD（商家） |
| 审核 | PATCH /products/{id}/status | 上架审核（管理员） |
| AI 店长 | POST /products/{id}/ai-generate | 生成文案 / 定价 |
| 购物车 | GET /cart, POST /cart/items, PUT/DELETE /cart/items/{id} | 购物车 |
| 订单 | POST /orders/checkout, GET /orders, PATCH /orders/{id}/status | 结算 + 状态机 |
| 评价 | POST /products/{id}/reviews, GET /products/{id}/reviews | 评价 + 情感分析 |
| AI 客服 | POST /ai/chat, GET /ai/conversations | 智能客服会话 |
| 商家 | GET /merchant/dashboard/stats, GET /merchant/products | 商家数据 |
| 管理员 | GET /admin/users, PATCH /admin/users/{id}, GET /admin/products, GET /admin/dashboard/stats, GET /admin/audit-logs | 平台管理 |

> 完整接口定义见 `PLAN.md` 与运行后的 `/docs` (Swagger)。

## 部署

采用 **单 Web 服务** 方案：后端 Docker 镜像在构建期一并打包前端静态产物（`dist/`），由 FastAPI 同源托管，
无需额外静态站点，也不存在跨域问题（前端始终使用相对 `/api`）。

- 后端：`backend/Dockerfile` 多阶段构建（Node 构建前端 → Python 运行后端），`uvicorn app.main:app` 启动。
- 数据库：生产使用 PostgreSQL；镜像内 `app.core.config.async_database_url` 会自动把平台提供的
  `postgresql://` 连接串转换为异步驱动 `postgresql+asyncpg://`。
- 前端：构建产物随镜像发布，访问 Web Service 地址即可打开完整应用。

### 一键部署（Render）

仓库根目录已提供 `render.yaml`，包含 1 个 Web Service（Docker）与 1 个 PostgreSQL 数据库：

```bash
# 1. 在 Render 新建 Blueprint，连接本仓库，自动按 render.yaml 创建服务与数据库
# 2. 在 ai-shop-backend 环境变量中填写 AI_API_KEY（留空则 AI 自动降级为本地 mock）
# 3. 将 FRONTEND_ORIGINS 占位域名改为实际生成的 Web Service 地址
```

环境变量说明：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | 由数据库自动注入（内部连接串，免 SSL） |
| `SECRET_KEY` | 运行时自动生成，用于 JWT 签名 |
| `FRONTEND_ORIGINS` | 前端来源（同源部署下不影响功能，填服务地址即可） |
| `AI_API_KEY` | OpenAI 兼容密钥，留空启用 mock 降级 |
| `AI_BASE_URL` / `AI_MODEL` | AI 接口地址与模型，可指向任意 OpenAI 兼容服务 |

### 本地容器验证

```bash
docker build -t ai-shop -f backend/Dockerfile .
docker run -p 8000:8000 -e DATABASE_URL="sqlite+aiosqlite:///./ai_shop.db" ai-shop
```

## 测试

### 后端接口测试（pytest）

无需预先启动服务器，直接以 ASGI 方式运行应用，使用独立测试库：

```bash
cd backend
pip install -r requirements.txt
python -m pytest tests -v
```

覆盖认证（双令牌 / 刷新轮换 / 登出吊销）、商城主流程与 RBAC 越权，共 18 项。

### 端到端冒烟测试（Playwright）

`frontend/playwright.config.ts` 会自动启动后端（SQLite 临时库 + 同源托管 `frontend/dist`），
浏览器访问后端地址即可验证「前端 SPA + 后端 API」整链路；需先构建前端：

```bash
cd frontend
npm install
npm run build            # 生成 dist/，e2e 依赖它
npx playwright install chromium
npm run e2e              # 或 npx playwright test
```

覆盖：未登录重定向、买家登录进入集市、管理员登录进入后台。

## 目录结构

```
try/
├── backend/   FastAPI 应用
├── frontend/  React 应用
├── PLAN.md    开发计划
└── README.md  本说明
```
