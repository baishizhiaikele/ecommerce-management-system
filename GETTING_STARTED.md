# AI 全托管小店 · 新手入门教程

> 面向第一次接触本项目的小伙伴。按「背景 → 环境 → 结构 → 实操 → 排错 → 部署」六个阶段讲解，所有命令均可直接复制运行（Windows 以 PowerShell 为准，文末附 bash 对照）。

---

## 阶段一：项目背景简介

### 1.1 这是什么
一个**全栈电商 demo 项目**：后端用 FastAPI 提供 REST API，前端用 React + TypeScript 提供界面，并内置了「AI 店长」（自动生成商品标题/文案/定价建议）和「AI 客服」（基于商品知识的智能问答）。它把一家小店从「上架商品 → 下单 → 支付 → 发货 → 收货 → 评价」的完整链路都跑通了。

### 1.2 三类角色与能做什么
| 角色 | 演示账号 | 能做的事 |
|------|----------|----------|
| 买家 Buyer | `buyer / buyer123` | 浏览商品、加购、下单、支付、确认收货、写评价、问 AI 客服 |
| 商家 Merchant | `merchant / merchant123` | 管理自己的商品、用 AI 生成文案、查看订单、发货 |
| 管理员 Admin | `admin / admin123` | 仪表板数据看板、审计日志、分类管理 |

### 1.3 技术栈一览
- **后端**：FastAPI（异步）、SQLAlchemy 2.0（异步引擎）、Pydantic v2、JWT 双令牌（access + refresh）、SQLite（本地）/ PostgreSQL（云端）
- **前端**：React 18 + TypeScript + Vite + Ant Design 5 + Axios + React Router
- **测试**：pytest（后端接口）、Playwright（端到端冒烟）
- **部署**：多阶段 Docker 构建，前端产物由后端**同源托管**（免跨域），`render.yaml` 一键部署

### 1.4 几个设计要点（先看一眼，后面会懂）
- **订单用状态机驱动**：状态只能在规定方向上流转（`pending_payment → paid → shipped → completed`，以及退款分支），避免乱改。
- **AI 可降级**：没配 `AI_API_KEY` 时，AI 接口自动返回 mock 文案，项目照常能跑。
- **同源部署**：生产环境前端 `dist/` 被后端直接托管，前后端共用一个域名，没有 CORS 烦恼。

---

## 阶段二：环境配置与依赖安装

### 2.1 前置要求
| 工具 | 版本 | 用途 | 检查命令 |
|------|------|------|----------|
| Python | 3.12 | 跑后端 | `python --version` |
| Node.js | 20.x | 跑前端 / 构建 | `node -v` |
| Git | 任意 | 版本管理 | `git --version` |
| Docker | 可选 | 容器化部署 | `docker -v` |

> 如果命令不是 3.12，请先安装对应版本。Windows 推荐用 [Python 官网](https://www.python.org/) 与 [Node 官网](https://nodejs.org/) 安装包。

### 2.2 获取代码
```powershell
# 已经克隆过则跳过；首次获取：
git clone <你的仓库地址> ai-shop
cd ai-shop
```

### 2.3 后端环境（重点）
```powershell
cd backend

# 1) 创建虚拟环境
python -m venv .venv

# 2) 激活虚拟环境（PowerShell）
.\.venv\Scripts\Activate.ps1
# 若提示“无法加载脚本因为禁止运行脚本”，先执行一次：
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# 然后重新激活

# 3) 安装依赖
pip install -r requirements.txt
```

> 依赖清单关键项：`fastapi` / `uvicorn[standard]` / `sqlalchemy` / `aiosqlite` / `asyncpg` / `pyjwt` / `passlib[bcrypt]` / `httpx` / `python-multipart`。
> 开发环境用 SQLite，无需安装数据库；云端 PostgreSQL 由 Render 自动创建。

### 2.4 配置环境变量（必须）
```powershell
# 复制模板
Copy-Item .env.example .env
```

然后用编辑器打开 `.env`，**至少把 `SECRET_KEY` 填上一个随机字符串**（JWT 签名必须），其余保持默认即可：

```ini
# .env 最小可用配置
PROJECT_NAME=AI 全托管小店
SECRET_KEY=请换成任意长随机串例如-a1b2c3d4e5f6
DATABASE_URL=sqlite+aiosqlite:///./ai_shop.db
ACCESS_TOKEN_EXPIRE_MINUTES=30
FRONTEND_ORIGINS=http://localhost:5173
AI_API_KEY=            # 留空 → AI 自动降级为 mock，不影响启动
ALLOW_SIGNUP=false
ENVIRONMENT=development
```

> ⚠️ 真实 `.env` 已被 `.gitignore` 忽略，**不会提交**；提交进仓库的只有 `.env.example` 模板。

### 2.5 初始化数据库与演示数据
```powershell
# 在 backend 目录、虚拟环境激活状态下：
python -m app.core.seed
```
该命令会：自动建表（create_all）+ 写入上面三套演示账号与若干示例商品。看到「种子数据写入完成」即成功。

### 2.6 前端环境
另开一个终端：
```powershell
cd frontend
npm install
```

### 2.7 启动项目（开发模式：前后端分离）
- **后端**（终端 A，仍在 backend 虚拟环境中）：
  ```powershell
  uvicorn app.main:app --reload --port 8000
  ```
- **前端**（终端 B）：
  ```powershell
  npm run dev
  ```
打开浏览器访问 **http://localhost:5173** 即可使用界面。后端 API 文档在 **http://localhost:8000/docs**。

---

## 阶段三：核心目录结构说明

```
ai-shop/
├── README.md              # 项目总览与部署说明
├── GETTING_STARTED.md     # 本教程
├── PLAN.md                # 开发计划与进度
├── render.yaml            # Render 一键部署蓝图（web 服务 + postgres）
├── .gitignore / .dockerignore
├── backend/
│   ├── Dockerfile         # 多阶段构建：先 build 前端，再跑后端
│   ├── requirements.txt   # Python 依赖
│   ├── .env.example       # 环境变量模板（复制为 .env 使用）
│   ├── scripts/           # 辅助脚本：check_audit / test_auth_flow / test_smoke
│   ├── tests/             # pytest 用例（27 项）
│   └── app/
│       ├── main.py        # 应用入口：挂载路由、静态文件、SPA 兜底
│       ├── state_machine.py   # 订单状态机（允许的流转规则）
│       ├── core/          # config（配置）、security（JWT/密码）、deps（依赖注入）、seed（种子数据）
│       ├── db/            # base（模型基类）、session（异步引擎/会话）
│       ├── models/        # SQLAlchemy 模型：user/product/order/cart/review/chat/audit...
│       ├── schemas/       # Pydantic 模型（请求/响应校验）
│       ├── api/           # 路由层：auth/products/cart/orders/reviews/ai/merchant/admin...
│       └── services/      # 业务逻辑层：product/order/review/chat/ai/dashboard/audit
└── frontend/
    ├── package.json       # 脚本与依赖（dev / build / preview / e2e）
    ├── playwright.config.ts   # 端到端测试配置
    ├── e2e/               # Playwright 冒烟用例（smoke.spec.ts）
    └── src/
        ├── api/           # axios 客户端（client / index）
        ├── store/         # 状态管理（auth / cart）
        ├── utils/         # 工具（format / roleRouting）
        ├── layouts/       # 布局（Admin / Merchant / Main）
        ├── components/    # 通用组件（ProtectedRoute 等）
        └── pages/         # 页面（Auth/Login、Market、Cart、Orders、Admin...）
```

**分层约定（新手务必理解）**：`api/` 只做「接收请求 → 调 service → 返回」，真正的业务逻辑写在 `services/`，数据形状由 `schemas/` 约束，数据库表结构在 `models/`。改功能优先去 `services/`，不要在大堆路由里堆逻辑。

---

## 阶段四：基础功能演示示例

> 下面示例默认后端已启动在 `http://localhost:8000`。
> **Windows 注意**：PowerShell 里 `curl` 是 `Invoke-WebRequest` 的别名，命令不同。请用 **`curl.exe`**（真正 curl），或在 Git Bash / WSL 中运行。

### 4.1 健康检查（最先验证服务活着）
```powershell
curl.exe -s http://localhost:8000/api/health
# 期望返回：{"status":"ok"}
```

### 4.2 在线接口文档（最省事的方式）
浏览器打开 **http://localhost:8000/docs**，每个接口都能直接「Try it out」点着试，不用写 curl。强烈推荐新手先在这里点一遍。

### 4.3 用 curl 走一遍买家购物全流程
下面把一整条链路打通（PowerShell 写法，注意用 `curl.exe` 和双引号转义）：

```powershell
# (1) 买家登录，拿到 access_token
$resp = curl.exe -s -X POST http://localhost:8000/api/auth/login `
  -H "Content-Type: application/json" `
  -d "{\"username\":\"buyer\",\"password\":\"buyer123\"}"
$token = ($resp | ConvertFrom-Json).access_token
Write-Host "拿到令牌：$token"

# (2) 浏览商品列表，挑一个 product_id
curl.exe -s http://localhost:8000/api/products
# 假设列表里有个商品 id 为 PRODUCT_ID（下面替换它）

# (3) 加入购物车
curl.exe -s -X POST http://localhost:8000/api/cart/items `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{\"product_id\":\"PRODUCT_ID\",\"quantity\":1}"

# (4) 结算下单（返回 order_id）
$order = curl.exe -s -X POST http://localhost:8000/api/orders/checkout `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{\"address\":\"北京市海淀区 demo 路 1 号\"}"
$orderId = ($order | ConvertFrom-Json).id
Write-Host "订单号：$orderId"

# (5) 买家支付（状态 pending_payment → paid）
curl.exe -s -X PATCH "http://localhost:8000/api/orders/$orderId/status" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{\"status\":\"paid\"}"
```

接下来切换到**商家**发货，再用**买家**确认收货，最后评价：

```powershell
# (6) 商家登录
$mResp = curl.exe -s -X POST http://localhost:8000/api/auth/login `
  -H "Content-Type: application/json" `
  -d "{\"username\":\"merchant\",\"password\":\"merchant123\"}"
$mToken = ($mResp | ConvertFrom-Json).access_token

# (7) 商家发货（paid → shipped）
curl.exe -s -X PATCH "http://localhost:8000/api/orders/$orderId/status" `
  -H "Authorization: Bearer $mToken" `
  -H "Content-Type: application/json" `
  -d "{\"status\":\"shipped\"}"

# (8) 买家确认收货（shipped → completed）
curl.exe -s -X PATCH "http://localhost:8000/api/orders/$orderId/status" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{\"status\":\"completed\"}"

# (9) 买家写评价
curl.exe -s -X POST "http://localhost:8000/api/products/PRODUCT_ID/reviews" `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{\"order_id\":\"$orderId\",\"rating\":5,\"content\":\"物流快，商品好用\"}"
```

> 状态流转不可跳步：必须先 `paid` 才能 `shipped`，再 `completed`。直接发 `completed` 会报 400。退款分支为 `paid/completed → refund_requested → refunded`。

### 4.4 商家 / 管理员的入口
- 商家：登录后访问 **http://localhost:5173/merchant** 管理商品；AI 生成文案见 4.5。
- 管理员：登录后访问 **http://localhost:5173/admin** 看仪表板与审计日志。

### 4.5 AI 功能演示
```powershell
# AI 客服：针对某商品提问（需先登录拿 token）
curl.exe -s -X POST http://localhost:8000/api/ai/chat `
  -H "Authorization: Bearer $token" `
  -H "Content-Type: application/json" `
  -d "{\"product_id\":\"PRODUCT_ID\",\"message\":\"这件商品适合送礼吗？\"}"
# 返回：{"conversation_id":"...","reply":"..."}

# AI 店长：为某商品生成标题/卖点文案/建议价（需商家 token）
curl.exe -s -X POST "http://localhost:8000/api/products/PRODUCT_ID/ai-generate" `
  -H "Authorization: Bearer $mToken" `
  -H "Content-Type: application/json" `
  -d "{}"
# 返回：{"title":"...","sales_copy":"...","price_suggestion":99.0}
```
> 若 `.env` 中 `AI_API_KEY` 为空，上述接口会返回**示例 mock 文案**，功能链路仍然完整可演示。

### 4.6 前端页面演示
直接访问 **http://localhost:5173** → 点「登录」→ 用上面任意演示账号进入 → 浏览市场、加购、下单。前端会自动把请求发到同源 `/api`（开发时由 Vite 代理转发到 8000）。

---

## 阶段五：常见问题排查指南

| 现象 | 原因 | 解决办法 |
|------|------|----------|
| 启动报 `SECRET_KEY ... required` | `.env` 没配或为空 | 编辑 `.env`，把 `SECRET_KEY` 设为任意随机串 |
| 后端启动报 `bcrypt` 警告 / 相关错误 | 依赖版本不匹配 | `requirements.txt` 已锁定 `bcrypt==4.0.1`；重装：`pip install -r requirements.txt` |
| 启动报 `Address already in use` / 端口 8000 被占 | 上次 uvicorn 没退出 | PowerShell 释放端口：`netstat -ano \| findstr :8000` 找到 PID，`taskkill /PID <PID> /F` |
| 前端调接口报 CORS / 跨域 | `FRONTEND_ORIGINS` 没包含前端地址 | 开发时保持 `.env` 中 `FRONTEND_ORIGINS=http://localhost:5173`；生产用同源部署则无需关心 |
| AI 接口返回的是“示例文案”而非真实回答 | 没配 `AI_API_KEY` | 在 `.env` 填真实 key 并重启后端；不想接也完全能跑（mock 模式） |
| 改了模型后查询报“no such table” | 项目用 `create_all` 自动建表，无迁移 | 删除本地 `ai_shop.db` 后重跑 `python -m app.core.seed` 重建 |
| 运行测试报 `playwright ... executable doesn't exist` | 浏览器未装 | `cd frontend && npx playwright install` |
| PowerShell 里 `curl` 行为怪异 | `curl` 是 `Invoke-WebRequest` 别名 | 改用 `curl.exe`，或换 Git Bash / WSL |
| 生产构建后刷新子路由 404 | 未做 SPA 兜底 | 本项目 `main.py` 已挂载 SPA 兜底；自托管静态时确保 `APP_STATIC_DIR` 指向 `dist` |
| 登录按钮点不到 / 文案对不上 | 按钮文案含空格「登 录」 | 测试里用结构选择器 `button[type=submit"]`，不要用精确文字匹配 |

---

## 阶段六：测试与部署（简介）

### 6.1 运行测试
```powershell
# 后端 pytest（需激活后端虚拟环境）
cd backend
pytest -q
# 期望：27 passed

# 端到端冒烟（需在 frontend 目录，且会自动拉起后端）
cd frontend
npx playwright install        # 首次需安装浏览器
npm run e2e
# 期望：3 passed（游客重定向 / 买家首页 / 管理员首页）
```

### 6.2 一键部署到 Render（简述）
1. 把代码推到 GitHub（`git remote add origin <url>` → `git push -u origin main`）。
2. Render 控制台 → **New → Blueprint** → 连接仓库，自动按 `render.yaml` 创建：
   - `ai-shop-backend`：Docker Web 服务（多阶段构建，同源托管前端）。
   - `ai-shop-db`：PostgreSQL 数据库。
3. 在 `ai-shop-backend` 环境变量里填 `AI_API_KEY`（可选），并把 `FRONTEND_ORIGINS` 占位域名改为实际生成的地址。
4. 部署完成后访问 Render 提供的 Web 服务地址即可。

> 详细步骤与架构图见仓库根目录 `README.md`。

---

## 附录 A：演示账号速查
| 角色 | 用户名 | 密码 |
|------|--------|------|
| 买家 | `buyer` | `buyer123` |
| 商家 | `merchant` | `merchant123` |
| 管理员 | `admin` | `admin123` |

## 附录 B：常用命令速查（PowerShell）
```powershell
# 后端
cd backend; .\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000     # 启动
python -m app.core.seed                        # 初始化库+演示数据
pytest -q                                      # 测试

# 前端
cd frontend
npm install; npm run dev                       # 开发
npm run build                                  # 产出 dist/
npm run e2e                                    # 端到端测试
```

---

> 小提示：本项目不含任何真实个人身份信息，演示账号均为占位数据，可放心用于作品集展示。
