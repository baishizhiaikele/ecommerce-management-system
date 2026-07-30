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

#### Windows 一键启动（可选）

仓库根目录提供两个启动辅助脚本，**二者任选其一**，逻辑相同：

- `run.vbs`：双击运行，会弹出持久化命令行窗口并调用 `start.bat`，避免窗口一闪而过（推荐日常双击使用）。
- `start.bat`：在已打开的命令行中直接运行，同时拉起后端（uvicorn）与前端（vite dev）。

> 这两个脚本仅用于本地开发的便捷启动；生产环境请走 Docker / Render 部署（见下文）。

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

## 演示级 / Mock 能力标注

本项目定位为**全栈作品集演示**，以下能力在默认配置下为「演示级 / 降级实现」，接入真实密钥或服务后即生效：

| 能力 | 默认行为（未配置） | 接入后真实行为 | 配置项 |
|---|---|---|---|
| AI 文案 / 定价 / 客服 / 营销 | 本地规则 mock 生成 | 调用 LLM 真实生成 | `AI_API_KEY` 等 |
| AI 一句话搜商品 | 关键词/规则解析降级 | LLM 结构化解析查询意图 | `AI_API_KEY` 等 |
| AI 商品图 | picsum 占位图 | 文生图真实生成 | `IMAGE_API_KEY` 等 |
| 支付 | sandbox 自测网关即时成功 | 真实网关 + webhook 验签 + 托管结算 | `PAYMENT_GATEWAY` 等 |
| 通知外发（邮件/短信） | 仅站内信 + 本地日志记录 | SMTP/SMS 真实投递 | `SMTP_*` / `SMS_*` |
| 定时报表邮件 | 仅写入 `EmailLog` 记录 | 配置 SMTP 后真实外发 | `SMTP_*` |
| 商品/评价图片 | 外链 picsum / Wikimedia | 经本地 `/api/images/proxy` 转发并缓存，规避外链不稳 | 无需配置（白名单内自动） |

> 任何「演示级」路径都做了**优雅降级**：缺密钥/服务时不影响主流程，仅功能降级，便于本地零配置跑通。

## 安全基线（已落地）

本项目经过一轮静态代码审查，3 项高危越权/敏感信息泄露与 13 项中危问题已全部修复，上线安全基线扎实：

- **认证与会话**：密码 bcrypt 哈希、`SECRET_KEY` 必填无默认值、JWT 存 HttpOnly Cookie（非 localStorage）、认证限流；安全响应头中间件（CSP / X-Frame-Options / nosniff / Referrer-Policy / HSTS）+ 请求体 10MB 上限。
- **越权修复**：商品写操作归属校验（杜绝 IDOR 越权改/删他人商品）、子账号权限绕过（缺失/禁用直接 403）、发票 PDF 越权读（归属校验 + 404 兜底）、评价删除归属校验、库存归属校验。
- **资金与一致性**：支付确认端点仅 sandbox 可用（生产返回 404，杜绝支付绕过）、退款金额夹紧 `[0, 实付]`、优惠券并发行锁防 double-spend、积分下限 + 买方行锁防超扣、订单状态流转锁顺序排序防死锁、状态变更与审计同事务原子提交。
- **性能/硬化**：列表 N+1 批量预取、订单列表服务端分页（上限 500）、WebSocket 校验用户 `is_active`、前端外链协议校验（`javascript:` 拦截 + `noopener`）、CI 密钥扫描（gitleaks）。
- 完整的高危/中危/低危清单与逐条修复记录见根目录 `CODE_REVIEW_REPORT.md`。

## UI 设计风格

全站采用**简约精选风**设计系统（参考 Apple / Shopify / Nordstrom）：大留白、统一栅格与圆角（radius 12/16）、柔和阴影与 `cubic-bezier(.22,.7,.3,1)` 动效曲线。设计令牌集中在 `frontend/src/theme.ts` 与 `frontend/src/index.css`（`.page-shell` / `.section-head` / `.hero-shell` / `.rail-scroll` / `.product-card` 等工具类），买家 / 商家 / 管理端共用同一套视觉语言，首屏减负不再像后台仪表盘。

## 角色与权限

- **buyer**：浏览（热搜/搜索历史/分面检索/联想）、SKU 规格选择加购、下单（优惠券+积分抵扣+PLUS 权益）、收藏、关注店铺与动态流、评价（带图/视频/追评/情感分析）、积分成长与签到、通知中心（WebSocket 实时推送 + 分类免打扰）、退货退款/换货/平台仲裁、转人工工单、逛店铺、促销活动（秒杀/拼团/砍价）、个性化推荐、浏览历史、种草社区、AR 试穿、PWA 离线
- **merchant**：商品管理（多规格 SKU）、库存流水/低库存预警/盘点、AI 店长/营销文案/智能定价、营销活动创建、评价运营（回复/置顶/删除/分布）、发货/录入物流/到店自提核销、客服工单、店铺装修、数据看板（客单价趋势/品类占比）、订单报表 CSV/订单清单 PDF/定时邮件、子账号权限矩阵、AI 比价、直播带货（弹幕边看边买）
- **admin**：商品审核、用户管理、平台仪表板、审计日志与可视化看板（操作回放 + 规则告警）、优惠券管理、担保交易结算台账

## 接口一览（前缀 `/api`）

| 模块 | 方法 & 路径 | 说明 |
|---|---|---|
| 认证 | POST /auth/register, /auth/login, /auth/refresh, GET /auth/me | 双令牌认证 |
| 分类 | GET /categories | 分类树 |
| 商品 | GET /products(支持 sort/min_price/max_price/in_stock/keyword), GET /products/{id}, POST/PUT/DELETE /products | 商品 CRUD + 增强搜索 |
| 审核 | PATCH /products/{id}/status | 上架审核（管理员） |
| AI 店长 | POST /products/{id}/ai-generate | 生成文案 / 定价 |
| AI 营销 | POST /products/{id}/ai-marketing | 多平台推广文案（小红书/朋友圈/抖音） |
| AI 定价 | POST /products/{id}/ai-price-advice | 智能定价建议 |
| 购物车 | GET /cart, POST /cart/items, PUT/DELETE /cart/items/{id} | 购物车 |
| 订单 | POST /orders/checkout(支持 coupon_id/use_points), GET /orders, PATCH /orders/{id}/status | 结算 + 状态机 |
| 退款 | POST /orders/{id}/refund, PATCH /orders/{id}/refund-review | 售后退款工作流 |
| 物流 | POST/GET /orders/{id}/logistics | 物流轨迹追踪 |
| 评价 | POST /products/{id}/reviews, GET /products/{id}/reviews | 评价 + 情感分析 |
| AI 客服 | POST /ai/chat(返回 needs_human), GET /ai/conversations | 智能客服 + 转人工意图识别 |
| 客服工单 | POST /support/tickets, GET /support/tickets, POST /support/tickets/{id}/messages, /close | 转人工工单 |
| 优惠券 | GET /coupons, POST /coupons/{id}/claim, GET /coupons/mine | 领券 / 我的卡券 |
| 收藏 | GET/POST/DELETE /favorites, GET /favorites/{id}/is-favorited | 收藏夹 |
| 通知 | GET /notifications, GET /unread-count, PATCH /notifications/{id}/read, POST /read-all | 站内信 |
| 积分 | GET /points/history | 积分明细；下单完成自动发放 |
| 推荐 | GET /recommendations | 个性化「猜你喜欢」 |
| 店铺 | GET /shops, GET /shops/{id} | 多商家店铺（Marketplace） |
| 库存 | GET /inventory/summary, /inventory/low-stock, /inventory/logs, POST /inventory/adjust | 商家库存流水与盘点 |
| 规格 | GET /merchant/products/{id}/variants, POST/PUT/DELETE /merchant/products/variants/... | 商品多规格 SKU |
| 关注 | POST/DELETE /follow, GET /follow/status, /count, GET /follow/following | 关注 / 取关店铺 |
| 搜索 | GET /search/hot, POST /search/record | 热搜词与记录 |
| 营销 | GET /promotions, POST /promotions(商家), GET /promotions/mine, DELETE /promotions/{id} | 秒杀/折扣/满减活动 |
| 评价管理 | GET /products/merchant/reviews, POST /reviews/{id}/reply, /pin, DELETE /reviews/{id}, GET /reviews/distribution | 商家评价运营 |
| 实时通知 | WS /ws/notifications | WebSocket 推送未读通知 |
| 商家 | GET /merchant/dashboard/stats, GET /merchant/products, GET /merchant/reports/orders(CSV) | 商家数据 + 报表 |
| 管理员 | GET /admin/users, PATCH /admin/users/{id}, GET /admin/products, GET /admin/dashboard/stats, GET /admin/audit-logs, GET /admin/audit-stats | 平台管理 + 审计看板 |
| 预售 | POST/GET /presales, POST /presales/{id}/orders, GET /presales/{id}/orders | 预售订单（定金 + 尾款） |
| 发票 | POST /invoices(开票), GET /invoices/mine, GET /invoices/{id}/pdf | 电子发票（含 PDF 导出） |
| 直播弹幕 | WS /live/{id}/ws, POST /live/{id}/messages | 直播间实时弹幕（WebSocket 替代轮询） |
| 图片代理 | GET /images/proxy?u=外部图片URL | 外链图片本地转发 + 磁盘缓存（SSRF 白名单） |
| 支付回调 | POST /payments/webhook/{gateway}, GET /payments/{id}/status | 支付/退款回调验签 + 托管结算 |
| 报表邮件 | POST /merchant/reports/tasks, GET /merchant/reports/tasks, POST /merchant/reports/tasks/{id} | 定时经营报表（配置 SMTP 后真实外发） |
| 通知外发 | （系统自动）重要通知经 SMTP/SMS 渠道投递 | 站内信 + 邮件/短信（未配置渠道时降级日志） |
| AI 搜索 | POST /search/qa | 一句话自然语言搜商品（配置 LLM 真实解析，否则降级） |
| AI 商品图 | POST /products/{id}/ai-image | 文生图（配置图床密钥真实生成，否则占位图降级） |

### 进阶接口（v4+ / P3，节选）

| 模块 | 方法 & 路径 | 说明 |
|---|---|---|
| 退货退款 | POST /orders/{id}/return-ship, /return-receive, /exchange, POST /orders/{id}/dispute, PATCH /orders/{id}/dispute-review | 逆向物流 + 平台仲裁（退款以实物退回为前提） |
| 担保交易 | GET /payments/settlements | 支付托管 `held→released/reversed`，确认收货释放、退款逆向 |
| AI 代理层 | POST /agent/chat, GET /agent/tools | 对话式购物：查库存/比价/凑单/加购/下单工具调用 |
| 种草社区 | GET/POST /notes, POST /notes/{id}/like | 图文笔记、挂载商品卡、点赞、搜索 |
| 店铺装修 | GET/PUT /decoration/mine, GET /decoration/{merchant_id} | 商家主题色/招牌/模块化 layout，买家公开渲染 |
| 会员 PLUS | GET /plus/status, POST /plus/subscribe | 付费月/年卡，全场 95 折 + 包邮 |
| 搜索增强 | GET /search/facets, GET /search/suggest | 分面检索（类目/价格/评分/排序）+ 输入联想 |
| 浏览历史 | GET /me/history, GET /me/recently-bought | 浏览记录与最近常买 |
| 商品问答 | GET /products/{id}/questions, POST /products/{id}/questions, POST /questions/{id}/answers, /accept | 买家问、商家/他人答、采纳 |
| 到店自提 | POST /orders/{id}/pickup-verify | 商家凭自提码核销，自动生成 8 位码免运费 |

> 完整接口与模块规划见 `PLAN.md`，运行后访问 `/docs` 查看 Swagger。

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
| `IMAGE_API_KEY` / `IMAGE_BASE_URL` / `IMAGE_MODEL` | 文生图密钥（如 gpt-image-1）；留空则商品图用占位图降级 |
| `PAYMENT_GATEWAY` | 支付网关：`sandbox`（默认自测）或 `stripe`/`alipay`/`wechat`；生产需注入对应密钥 |
| `PAYMENT_SECRET` / `PAYMENT_NOTIFY_BASE_URL` | 支付回调验签与异步通知地址 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | 邮件外发渠道；留空则通知/报表仅记录不真正发送 |
| `SMS_API_KEY` / `SMS_BASE_URL` | 短信网关；留空则短信降级为日志 |

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

覆盖认证（双令牌 / 刷新轮换 / 登出吊销）、商城主流程、RBAC 越权、优惠券、积分、推荐、店铺、退款工单、物流追踪、退货退款 / 仲裁、担保交易、秒杀 / 拼团 / 砍价、到店自提、店铺装修、种草社区、会员 PLUS、AI 代理层等，共 90+ 项（`backend/tests/` 下按模块分文件）。

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

覆盖：`smoke.spec.ts`（未登录重定向、买家登录进入集市、管理员登录进入后台）与 `features.spec.ts`（买家进入我的卡券并领取优惠券、我的收藏、多商家店铺「逛店铺」、通知中心、商品集市「猜你喜欢」推荐）。

## 目录结构

```
ai-shop/
├── backend/            FastAPI 应用
├── frontend/           React 应用
├── plans/DEVLOG.md     各阶段功能落地、优化与修复的详细执行日志
├── PLAN.md             计划与状态总览（权威）
├── README.md           项目说明与部署
├── CODE_REVIEW_REPORT.md  安全代码审查报告与修复记录
└── GETTING_STARTED.md  新手入门教程
```
