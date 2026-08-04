# AI 全托管小店 · AI-Powered E-commerce Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12+-blue.svg)](https://python.org)
[![Node](https://img.shields.io/badge/Node-20.x-brightgreen.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com)

面向"想开店但不会运营的个人卖家"的全栈电商平台。**电商为骨架，AI 深度集成为灵魂** — 从选品、定价、推荐到客服，AI 贯穿全链路。AI 密钥缺失时自动降级为本地 mock，核心业务流程不中断。

---

## 特性

- **三端分离**：买家商城 / 商家后台 / 管理后台，RBAC 权限控制
- **完整交易链路**：商品 → 购物车 → 确认订单 → 支付 → 发货 → 收货 → 评价
- **AI 全链路集成**：智能推荐、AI 导购代理、首页个性化编排、AI 选品与定价、客服知识库
- **营销体系**：优惠券、积分、PLUS 会员、秒杀、预售、分销裂变、直播带货
- **内容社区**：种草笔记、商品问答、评价（含图/视频/追评）
- **安全基线**：JWT 双令牌 + HttpOnly Cookie、支付回调验签、资金精度 Numeric(12,2)、越权修复
- **国际化**：中英文双语（i18n 1701 键值完整对齐）
- **游客浏览**：未登录可浏览商品、搜索、加购，结算时引导登录

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 后端框架 | FastAPI 0.115（异步） |
| ORM | SQLAlchemy 2.0（async） |
| 数据校验 | Pydantic V2 |
| 认证 | JWT（bcrypt + HttpOnly Cookie） |
| 数据库 | 开发 SQLite / 生产 PostgreSQL（同一 ORM） |
| 缓存 | Redis（可选，懒加载降级） |
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite 5 |
| UI 库 | Ant Design 5 + Tailwind CSS |
| 状态管理 | Zustand |
| 测试 | pytest（后端 155 用例）/ Vitest + React Testing Library（前端 48 用例）/ Playwright（E2E） |

---

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 20.x+
- （可选）Docker Desktop

### 一键启动（Windows）

```bash
# 双击运行
start.bat
```

### 手动启动

**1. 后端**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 复制并配置环境变量（SECRET_KEY 必填）
cp .env.example .env

# 初始化数据库并写入演示数据
python -m app.db.init_db
python -m app.core.seed

# 启动
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**2. 前端**

```bash
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173

### 演示账号

| 角色 | 用户名 | 密码 |
|---|---|---|
| 买家 | `buyer` | `buyer123` |
| 商家 | `merchant` | `merchant123` |
| 管理员 | `admin` | `admin123` |

### Docker 部署

```bash
docker compose up -d
```

---

## 项目结构

```
├── backend/
│   ├── app/
│   │   ├── api/          # 46 个路由模块（/api/*）
│   │   ├── models/       # 39 个 SQLAlchemy ORM 模型
│   │   ├── services/     # 49 个业务逻辑服务
│   │   ├── schemas/      # Pydantic 请求/响应模型
│   │   ├── core/         # 配置、安全、依赖注入、事件总线
│   │   └── main.py       # 应用入口
│   ├── tests/            # pytest（155 用例）
│   └── migrations/       # Alembic（17 个版本）
├── frontend/
│   ├── src/
│   │   ├── pages/        # 54 个页面组件（买家/商家/管理）
│   │   ├── components/   # 通用组件（AsyncBoundary、ProductCard 等）
│   │   ├── api/          # 17 个 API 模块（按域拆分）
│   │   ├── store/        # Zustand 状态管理
│   │   ├── i18n/         # 中英文词典（各 1701 键）
│   │   └── layouts/      # 三套布局（Main/Merchant/Admin）
│   └── e2e/              # Playwright E2E
├── plans/                # 项目规划文档
├── docker-compose.yml
├── render.yaml           # Render 一键部署
└── start.bat             # Windows 一键启动
```

---

## 主要接口一览

### 买家端

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/products` | 商品列表（支持分页/筛选/排序） |
| GET | `/api/products/{id}` | 商品详情（含评价/问答/推荐） |
| GET | `/api/search` | AI 搜索（支持分面检索/联想/以图搜图） |
| GET | `/api/cart` | 购物车（支持游客 localStorage 合并） |
| POST | `/api/orders/checkout` | 下单结算 |
| GET | `/api/orders` | 我的订单 |
| POST | `/api/orders/{id}/refund` | 申请退款 |
| GET | `/api/ai/home-arrange` | AI 首页个性化编排 |
| POST | `/api/agent/chat` | AI 导购代理（自然语言交互） |
| GET | `/api/recommendations` | 个性化推荐 |

### 商家端

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/products` | 创建商品 |
| PUT | `/api/products/{id}` | 更新商品 |
| GET | `/api/merchant/dashboard` | 经营数据看板 |
| POST | `/api/products/{id}/ai-generate` | AI 生成商品文案 |
| GET | `/api/inventory/low-stock` | 低库存预警 |
| POST | `/api/coupons` | 创建优惠券 |
| GET | `/api/presales` | 预售管理 |
| GET | `/api/live` | 直播管理 |

### 管理端

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/admin/dashboard` | 平台总览 |
| GET | `/api/admin/users` | 用户管理 |
| GET | `/api/admin/audit` | 审计日志 |
| POST | `/api/admin/reports/email` | 定时报表邮件 |

> 完整接口列表参见后端代码 `backend/app/api/` 目录。

---

## 测试

```bash
# 后端
cd backend
pytest -q                          # 155 用例

# 前端
cd frontend
npx vitest run                     # 48 用例
npx tsc --noEmit                   # 类型检查
npx playwright test                # E2E
```

---

## AI 降级说明

| 能力 | 有 AI_API_KEY | 无 KEY（本地/CI） |
|---|---|---|
| 智能推荐 | 大模型生成推荐理由 | 确定性规则推荐 |
| AI 导购 | LLM 对话 | 关键词匹配 + mock 回复 |
| 首页编排 | LLM 决策楼层顺序 | 确定性身份+时段查表 |
| 商品文案 | GPT 生成 | 模板文案 |
| 客服知识库 | 自学习 | 预置 FAQ |

---

## 部署

### Render 一键部署

项目根目录包含 `render.yaml`，在 Render 中创建 Web Service 即可自动部署：
- 使用 Docker 多阶段构建（后端同源托管前端 `dist/`）
- 自动执行 `alembic upgrade head` 数据库迁移

### 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `SECRET_KEY` | ✅ | JWT 签名密钥 |
| `DATABASE_URL` | 否 | 数据库连接串（默认 SQLite） |
| `REDIS_URL` | 否 | Redis 缓存（可选，无则降级） |
| `AI_API_KEY` | 否 | AI 服务密钥（无则 mock 降级） |
| `FRONTEND_ORIGINS` | 否 | CORS 白名单 |

---

## 文档

| 文档 | 说明 |
|---|---|
| [PLAN.md](PLAN.md) | 权威状态摘要（里程碑+安全基线） |
| [GETTING_STARTED.md](GETTING_STARTED.md) | 新手六阶段教程 |
| [CODE_REVIEW_REPORT.md](CODE_REVIEW_REPORT.md) | 安全审查报告 |
| [plans/PROJECT_PLAN.md](plans/PROJECT_PLAN.md) | 完整演进记录+路线图 |
| [plans/PERF_TESTING.md](plans/PERF_TESTING.md) | 性能压测指南 |

---

## 贡献指南

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feat/your-feature`
3. 确保测试通过：`cd backend && pytest -q` + `cd frontend && npx tsc --noEmit && npx vitest run`
4. 提交代码：`git commit -m "feat: your feature description"`
5. 发起 Pull Request

### 代码约定

- 后端：路由层仅做参数校验和调用 service，业务逻辑统一在 `services/`
- 前端：按业务域组织 API 模块（`api/products.ts`），类型定义在 `api/types.ts`
- 国际化：新增文案同时补充中英文键值（`i18n/zh.ts` + `i18n/en.ts`）
- 角色字符串：后端统一使用 `Role` 枚举（`Role.MERCHANT.value`），禁止硬编码 `"merchant"`

---

## License

MIT
