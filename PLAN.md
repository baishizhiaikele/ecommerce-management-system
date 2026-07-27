# AI 全托管小店 — 开发计划与路线图

> 全栈电商管理平台：以电商为骨架（商品 / 购物车 / 订单状态机 / 三角色 RBAC / 仪表板），
> 以 **AI 深度集成** 为差异化灵魂（AI 店长一键生成文案定价、AI 智能客服、评论情感分析预警）。
> 项目目标：充实简历 + 作为毕业设计，可实际部署展示完整业务逻辑。
>
> 本文档合并了三版规划：① 开发计划（v1，已落地）② 功能拓展路线图（v2）③ 内容扩展蓝图（v3）。

---

## 一、技术栈

- 后端：FastAPI + SQLAlchemy 2.0(异步) + Pydantic V2 + passlib(bcrypt) + python-jose(JWT)
- 前端：React 18 + TypeScript + Vite + Ant Design 5 + React Router 6 + Axios + Zustand + Tailwind
- 数据库：开发 SQLite，生产 PostgreSQL（同一 ORM，连接串经环境变量切换）
- 部署：后端 Dockerfile + uvicorn；前端静态构建；render.yaml 一键部署
- AI：OpenAI 兼容接口（可配置 base_url/key），无 key 时启用确定性 mock 降级

## 二、用户角色（RBAC）

| 角色 | 能力 |
|---|---|
| buyer 买家 | 浏览商品、加购、下单、评价、发起 AI 客服咨询 |
| merchant 商家 | 上架商品、AI 店长生成内容、发货、查看自己的数据看板 |
| admin 管理员 | 审核商品、管理用户、查看平台仪表板、查看审计日志 |

## 三、核心模块

1. 认证与 RBAC：JWT 双令牌（access+refresh）、令牌无感刷新、角色依赖注入
2. 商品与分类：分类树、商品 CRUD、库存、上架审核流（draft→pending→active/rejected）
3. 购物车与订单：购物车、结算、订单状态机（pending_payment→paid→shipped→completed / 退款分支）
4. AI 店长：基于商品信息一键生成标题 / 卖点文案 / 定价建议
5. AI 智能客服：买家在商品详情页发起会话，AI 基于商品上下文自动回复
6. 评价与情感：订单完成后评价，系统自动情感分析并预警差评
7. 仪表板：商家销售额 / 热销看板；管理员用户 / 商品 / 交易总览
8. 审计日志：关键写操作留痕，管理员可查

## 四、订单状态机

```
pending_payment --(buyer 支付)--> paid
paid --(merchant 发货)--> shipped
shipped --(buyer 确认收货)--> completed
paid --(buyer 申请退款)--> refund_requested
refund_requested --(merchant/admin 处理)--> refunded
```

流转由 `app/state_machine.py` 集中校验，防止越权。

## 五、架构

```
React(AntD) --/api--> FastAPI Router
                       |-- Auth & RBAC 依赖
                       |-- Service 层
                       |     |-- 订单状态机
                       |     |-- 事件总线 --> AI 服务 / 审计日志
                       |-- SQLAlchemy 模型 --> SQLite / PostgreSQL
```

## 六、目录

```
try/
├── backend/   FastAPI 应用（app/{core,db,models,schemas,services,api}）
├── frontend/  React 应用（src/{api,store,layouts,components,pages}）
├── PLAN.md    本计划
└── README.md  项目说明与部署
```

## 七、设计要点

- 写接口经依赖注入校验角色，越权返回 403
- 订单号 `ORD-YYYYMMDD-NNNN`，序列表 + 行锁保证并发唯一
- 支付为模拟确认（无真实支付网关），状态机推进即用
- AI 调用全程 try/except，超时或缺少 key 时返回 mock 文案，主流程不中断
- 审计：service 层统一调用 `audit_service.record()`
- 边界检查：库存不足拒绝结算、评价仅限本人已完成订单、价格/数量非负、分页参数校验

## 八、实施进度（v1，已落地）

- [x] 后端核心：schemas 补全、事件订阅接线、审计全量接入（含双令牌刷新 / 吊销轮换）
- [x] 商品 / 分类 / 购物车 / 订单 / 评价 / AI 客服 全量接口（端到端冒烟已通过）
- [x] 前端全部业务页面（React 18 + TS + AntD 5，生产构建 `BUILD_OK`）

  - 基础设施：axios 封装（401 自动无感刷新令牌）、角色路由守卫、三角色布局、刷新页面恢复登录态
  - 买家端：商品集市（搜索 / 分类筛选）、商品详情（加购 / AI 客服对话 / 评价展示）、购物车结算、订单列表 / 详情、订单状态机流转、已完成订单评价
  - 商家端：数据看板（销售额 / 订单 / 库存统计 + 7 天销售趋势图）、商品管理（CRUD + AI 店长一键生成标题 / 文案 / 定价建议）
  - 管理员端：平台仪表板、商品审核（通过 / 驳回）、用户管理（启用禁用 / 角色调整）、负面评价预警、审计日志

- [x] pytest 接口测试（27 项全绿：认证 / 商城主流程 / RBAC 越权）
- [x] Playwright 端到端冒烟测试（playwright.config.ts + e2e/smoke.spec.ts，覆盖鉴权重定向 / 买家 / 管理员登录）
- [x] Docker / render.yaml 部署配置与文档（多阶段 Dockerfile + render.yaml 单服务同源托管 + README 部署章节）

---

# 功能拓展路线图（v2）

> 目标：在现有全栈电商（FastAPI + React + 三角色 + 订单状态机 + AI 降级）基础上，分 5 阶段新增 18 个功能模块。
> 原则：复用现有分层（api/services/models/schemas）、事件总线 `events.py`、状态机 `state_machine.py`、审计 `audit_service`；演示数据不写任何个人身份信息。

## 阶段总览

| 阶段 | 主题 | 模块 |
|------|------|------|
| P1 | 基础设施与横切能力 | 图片上传、搜索增强、积分/会员、优惠券、收藏、通知（模型+事件） |
| P2 | 买家侧体验 | 收藏页、通知中心、优惠券结算抵扣、积分成长中心 |
| P3 | AI 差异化亮点 | 个性化推荐「猜你喜欢」、AI 营销文案、AI客服意图识别转人工 |
| P4 | 商家侧经营 | 多商家店铺页、经营报表 CSV 导出、客服转人工工单台 |
| P5 | 售后与平台治理 | 退款售后工单、物流追踪、审计可视化看板、i18n 中英文 |

### P1 · 基础设施与横切能力

1. **图片上传（基础设施）**：`POST /upload/image`（接收 multipart，存本地 `backend/uploads/` 或对象存储，返回 URL 写入 `Product.image_url` / `Review` 图片）；前端商品管理、评价表单接入上传组件；`.gitignore` 忽略 `uploads/`（保留 `.gitkeep`）；限制类型/大小，防目录穿越。
2. **搜索增强**：`GET /products` 增加 `sort`（销量/价格/最新）、`min_price/max_price`、`in_stock`、多关键词分词匹配。
3. **积分 / 会员体系**：`points` 字段（User）、`PointLog` 流水表；下单完成 +积分、退单 -积分；按累计积分映射 VIP 等级，享受等级折扣；事件总线订阅 `order_completed` / `order_refunded`。
4. **优惠券 / 促销**：`Coupon`（满减/折扣/新人券）、`UserCoupon`（领取记录）；`POST /coupons/{id}/claim`、`GET /coupons/mine`；结算 `checkout` 入参 `coupon_code`；新人注册自动发券。（注：已落地基础版，仍需补齐商家/管理员创建编辑 UI）
5. **收藏 / 心愿单**：`Favorite(user_id, product_id)` 唯一约束；`POST/DELETE /favorites`、`GET /favorites`。
6. **站内信 / 通知中心**：`Notification(user_id, type, title, content, is_read, ref_id)`；事件总线订阅订单状态变更、差评预警、优惠券到账、积分变动；`GET /notifications`、`PATCH /notifications/{id}/read`、`POST /notifications/read-all`。

### P2 · 买家侧体验（前端为主）

- 收藏页 `pages/buyer/Favorites.tsx`：栅格卡片，一键移入购物车。
- 通知中心 `pages/buyer/Notifications.tsx`：列表 + 标记已读 + 红点角标（接 Zustand）。
- 结算抵扣：`Checkout.tsx` 增加优惠券选择、积分抵扣开关，实时显示应付。
- 积分成长中心 `pages/buyer/Points.tsx`：等级进度条 + 积分流水。

### P3 · AI 差异化亮点

7. **个性化推荐「猜你喜欢」**：`GET /recommendations`（行为或类目相似度，无行为时返回热销）；首页信息流模块带「为你推荐」标。
8. **AI 营销文案生成**：`POST /products/{id}/ai-marketing`（平台：小红书/朋友圈/抖音）→ 风格化文案；商家商品管理页「一键生成推广文案」面板。
9. **AI 智能定价建议**：扩展 `ai_service.generate_product_copy` 返回 `price_suggestion` + 调价理由；`GET /products/{id}/ai-price-advice`。
10. **客服意图识别 + 转人工**：`ai_service` 增加意图置信度；低置信返回「建议转人工」；`POST /support/tickets` 建工单，`GET /merchant/support/tickets` 商家处理。

### P4 · 商家侧经营

11. **多商家店铺页（Marketplace）**：`GET /shops/{merchant_id}`；`pages/shop/Shop.tsx` 店铺首页。
12. **经营报表导出**：`GET /merchant/reports/orders?format=csv` 流式返回 CSV；商家仪表板「导出报表」按钮。
13. **客服转人工工单台**：见 P3-10；`pages/merchant/SupportTickets.tsx`。

### P5 · 售后与平台治理

14. **退款售后工单**：状态机扩展退货款分支，新增 `REFUND_REJECTED`；`POST /orders/{id}/refund`、`PATCH /orders/{id}/refund-review`；订单详情「申请退款」、审核队列。
15. **物流追踪**：`POST /orders/{id}/logistics` 或对接快递 API mock；前端订单详情物流时间线。
16. **审计可视化看板**：扩展 `GET /admin/audit-logs` 聚合；`pages/admin/AuditDashboard.tsx` 折线/环形图（recharts）。
17. **i18n 国际化**：接入 i18next，抽取文案，中/英切换。

### 收尾（tests-deploy）

- pytest 补充：优惠券计算、积分记账、退款状态机、推荐非空。
- Playwright e2e：领券→结算抵扣、收藏→加购、退款申请→审核。
- 更新 `README.md` / `GETTING_STARTED.md`；`render.yaml` 如需新增环境变量则补充。

### 实施顺序（todolist）

1. `foundation-models`：P1 全部模型 + 事件订阅
2. `buyer-features`：P2 后端接口 + 前端买家中心
3. `ai-extensions`：P3 AI 扩展 + 推荐 + 前端营销/推荐
4. `trade-deepening`：P4/P5 售后/物流/店铺 + 前端
5. `admin-data`：P5 报表/审计/i18n + 前端
6. `tests-deploy`：测试 + 文档 + 部署校验

---

# 内容扩展蓝图（v3）

> 调研依据：主流电商平台管理后台（淘宝/京东/拼多多/Shopify）普遍以
> **商品 / 订单 / 库存 / 用户 / 营销 / 数据监控** 为六大核心中枢。
> 现状盘点：本项目 P1–P5 路线图已基本落地，骨架扎实，
> 但"运营营销、库存管理、分类树、深数据看板、买家个人中心"仍是明显短板。
>
> 原则：复用现有分层（api / services / models / schemas）、事件总线 `events.py`、
> 状态机 `state_machine.py`、审计 `audit_service`；演示数据不写任何个人身份信息。

## 现状缺口（来自代码盘点）

- 支付为"伪支付"，无真实网关/未支付自动取消定时任务
- 优惠券只有 seed，商家/管理员**无创建/编辑/下发券的 UI**
- 商品分类 `parent_id` 字段存在但**无多级分类树 UI 与层级筛选**
- **无独立库存管理**（无入库/出库流水、无库存预警触发通知）
- 数据看板仅"7 天销售趋势折线 + 统计卡"，**无品类占比/用户增长/转化漏斗/客单价/时间范围选择**
- 评价管理仅"差评预警"，**无全部评价列表/回复/评分分布**
- **无个人中心/地址簿**（地址每次手填，无地址簿）
- 积分"每日签到"是死标签（后端无签到接口）；**无积分商城兑换**
- 搜索仅模糊匹配，**无历史搜索/热门搜索/相关推荐**
- 通知为轮询拉取，**无 WebSocket 实时推送**
- i18n 为半成品（仅顶栏翻译，页面内文案硬编码中文）

## 扩展蓝图（按模块，标注优先级）

### ★ A. 营销中心（最高优先级，最像"管理系统"）

1. **优惠券后台管理**（商家 + 管理员）：`Coupon` 模型增强（门槛/折扣/类型/库存/有效期/适用类目）；`POST /coupons`、`PUT /coupons/{id}`、`GET /admin/coupons`、`DELETE`；发放/撤回；前端商家「营销 → 优惠券」页、管理员「优惠券管理」页。
2. **限时促销活动 / 秒杀专区**：`Promotion`（类型：秒杀/限时折扣/满减包）、时间窗、`GET /promotions`、买家端活动商品打标；前端「活动专区」页 + 商家「创建活动」页。
3. **新人/首单自动发券**（事件总线订阅注册/首单）。

### ★ B. 商品与库存

4. **多级分类树管理**：`categories` 树形读写接口（建/改/删/移动节点、禁止成环）；前端管理员「商品分类」树形管理页；买家 Market 按分类树多级筛选。
5. **库存管理**：`StockLog`（入库/出库/调整/盘点流水）、低库存预警；盘点调整接口；预警经事件总线发通知给商家；前端商家「库存管理」页。
6. （可选，较大）商品多规格 SKU。

### ★ C. 数据看板增强

7. **多维可视化**：`/admin/analytics`、`/merchant/analytics` 增加品类销售占比、用户增长、转化漏斗、客单价、可自定义时间范围（1–30 天）、实时概览；前端替换写死的 7 天。

### ★ D. 买家体验增强

8. **个人中心 / 地址簿**：`Address` 模型 + CRUD；`user` 资料编辑；`GET/PATCH /me`；前端买家「个人中心」页 + 地址簿。
9. **每日签到 + 积分商城**：`signin` 接口（每日一次、连签奖励）；`PointMall` 兑换（积分换券）；前端「签到」按钮 + 「积分商城」。
10. **搜索增强**：历史搜索、热门搜索词、相关推荐位。
11. **关注店铺**：`FollowShop` 模型 + 关注/取关/我的关注。

### ★ E. 平台治理与售后增强

12. **评价管理**：全部评价列表/回复/置顶/删除、评分分布、好评率。
13. **退款增强**：部分退款、退货物流、协商留言（扩展退款状态机，加 `REFUND_REJECTED`/协商态）。
14. **WebSocket 实时通知**：FastAPI WebSocket 推送未读，替换 20s 轮询。

## 优先级建议（推荐实施顺序）

1. **A 营销中心**（优惠券后台 + 限时活动）— 最能体现"管理系统"价值，且复用现有 coupon 模型。
2. **B 分类树 + 库存管理** — 补齐商品运营底座。
3. **C 数据看板多维图表** — 用 recharts 低成本的"视觉增量"。
4. **D 个人中心/地址簿 + 签到/积分商城** — 提升买家留存感。
5. **E 评价管理 / 退款增强 / WebSocket** — 治理与实时性收尾。

> 备注：伪支付与 i18n 完整化可作为穿插小项，按需安排。

## 复用与约束

- 所有写操作经 `audit_service.record()` 留痕；营销/库存/签到事件经 `events.py` 总线解耦（通知、积分、审计）。
- 新增状态/流转一律进 `state_machine.py` 集中校验，防止越权。
- 演示数据严格匿名（角色通用化、账号 demo 占位），不写姓名/学校等个人信息。
- 每个大模块配套最小 pytest 用例；前端改动后 `npm run build` 验证。

---

## 本轮完善（已落地）

> 对应上面 v2/v3 蓝图中的多项缺口，本次集中实现并完成验证（前端 `npm run build` 通过，后端 `pytest` 27 项全绿）。

### 已新增后端能力
- **库存管理**：`StockLog` 流水模型（入库/出库/调整/销售/取消回库）+ `recompute` 逻辑；低库存预警经事件总线发通知；`GET /inventory/summary`、`/inventory/low-stock`、`/inventory/logs`、`POST /inventory/adjust`（商家）。
- **商品多规格 SKU**：`ProductVariant` 模型（sku_code/specs/price_delta/stock/image）；商家增删改 + 自动同步 `Product.stock`；购物车/结算/订单贯通 `variant_id`，价格按 `price_delta` 计算。
- **关注店铺**：`FollowShop` 模型 + 关注/取关/我的关注/粉丝数（买家侧）；店铺页关注按钮。
- **搜索增强**：`SearchKeyword` 热搜词记录；`GET /search/hot`、`POST /search/record`。
- **营销活动**：`POST /promotions`（商家自建秒杀/折扣/满减）、`GET /promotions/mine`、`DELETE /promotions/{id}`；公开 `GET /promotions` 增加进行中过滤与商品冗余信息。
- **评价管理**：商家全部评价列表（按商品/情感筛选、分页）、回复、置顶、删除、评分分布；`review.reply`、`review.is_pinned` 字段。
- **退款增强**：`Order.refund_amount`、部分退款金额、`POST /orders/{id}/return-logistics` 退货物流。
- **实时通知**：`ConnectionManager` + `WS /ws/notifications` 令牌鉴权推送，取代轮询。
- **支付超时**：生命周期后台任务 `scheduler_loop` 自动取消 30 分钟未支付订单（经状态机校验，无额外调度依赖）。
- **商品过滤**：`GET /products` 支持 `merchant_id`（修复商家商品管理视图）。
- **数据看板**：`sales_trend` 增加每日订单数与客单价（AOV）计算。

### 已新增前端页面 / 交互
- 买家：**促销活动专区**（`/promotions`，按类型分组 + 倒计时）、**我的关注**（`/following`）、Market **热搜标签 + 搜索历史**、商品详情 **SKU 规格选择 + AI 智能导购对话抽屉 + 评价提交**、全局 **WebSocket 通知 Toast**。
- 商家：**库存管理**页、**评价管理**页、**营销活动**页、商品 **规格管理抽屉**、数据看板 **时间范围选择（7/30/90 天）+ 客单价趋势图**。
- 工程：CI（`.github/workflows/ci.yml` 后端 pytest + 前端 build）、i18n 词条扩充并在 Market / 商品详情 / 导航 落地。

### 验证状态
- 后端：`pytest` 27 项全部通过（`TESTING=True` + SQLite）。
- 前端：`npm run build` 成功产出 `dist/`（仅 chunk size 警告，非错误）。
- 已知约束：演示数据库通过 `create_all` + `_ensure_demo_columns()` 演进 schema；生产环境建议以 Alembic 迁移为准。

---

# 未来优化与新增路线图（v4）

> 阶段定位：v1–v3 已交付完整电商骨架（三角色 RBAC、订单状态机、AI 店长/智能客服/情感分析/个性化推荐、库存流水 + 多规格 SKU、营销活动、关注/收藏、WebSocket 实时通知、审计看板、Alembic 迁移、双令牌 JWT、CI）。
> v4 目标：从「能跑通业务」走向「真实商业闭环 + AI 差异化放大 + 工程品质加分」，按 ROI 排序、分批落地。
> 复用：现有 `api/services/models/schemas` 分层、事件总线 `events.py`、状态机 `state_machine.py`、审计 `audit_service`、`ws.py`，以及已有模型（`content` / `follow` / `inventory` / `variant` / `reward` / `search` 等）均可直接延展。
> 约束：演示数据严格匿名、不写任何个人身份信息；每次改动补最小 pytest、前端 `npm run build` 验证；新增数据库字段必须配套 Alembic 迁移，不再依赖 `create_all` 演进。

## 落地优先级总览

| 优先级 | 主题 | 代表模块 | 价值 |
|---|---|---|---|
| **P0 商业闭环** | 真实支付、运费模板、缓存、降价提醒 | 让作品「真能卖」、性能可量化 | 补齐最关键的营收与体验断点 |
| **P1 差异化** | AI 商品图、AI 搜索问答、会员等级、签到任务、看板增强 | 突出 AI 卖点、提升留存 | 与同类作品拉开差距 |
| **P2 体验/工程** | 直播分销、种草社区、AR 试穿、异步队列、可观测性 | 长期打磨、工程品质加分 | 简历亮点 / 生产级打磨 |

---

## 一、交易与履约（P0）

**新增**
1. **真实支付对接**：新增 `payments` 模块（Stripe / 微信支付沙箱二选一），落地异步支付回调与 `pending_payment → paid` 的真实确认；现有 `scheduler_loop` 已处理 30 分钟未支付自动取消，可平滑接入。需配套：支付记录表、回调验签、幂等处理、退款原路退回。
2. **运费模板**：按地区 / 重量 / 件数规则计算运费，结算页展示并写入订单；复用 `order_service`。
3. **预售 / 定金**：复用状态机新增 `presale`（付定金 → 付尾款 → paid）子状态。
4. **到店自提 / 多仓发货**：订单支持自提点，物流按仓库路由。
5. **电子发票 + 换货流程**：当前仅退款，新增换货状态分支与发票申请接口。
6. **拼团 / 多人购**：`group_buy` 聚合 + 倒计时，落地社交裂变低价。

**优化**
- 退款工单增加**自动审核规则**（小额自动退，仍经状态机校验）。

## 二、营销与增长（P1）

**新增**
1. **分销 / 裂变佣金**：买家生成推广链接，成交返佣，新增 `affiliate` 模块（关系链 + 佣金结算 + 提现申请）。
2. **签到 + 任务中心**：连续签到发积分、新手任务礼包（后端 `signin` 接口此前为死标签，需真正落地）。
3. **会员等级体系**：成长值 → 等级 → 专属折扣 / 包邮，复用现有积分（`PointLog`）。
4. **直播带货 / 数字人**：结合已有 `ws.py` 做直播间实时弹幕与边看边买。

**优化**
- AI 营销文案扩展到**短视频脚本 / 带货话术**（现仅小红书 / 朋友圈 / 抖音图文）。
- 促销活动支持**满赠、N 元任选、第二件半价**（现仅秒杀 / 折扣 / 满减）。

## 三、AI 深化（P1，核心卖点）

**新增**
1. **AI 商品图生成**：文生图生成主图 / 场景图（接图像模型），补全「不会运营也能开店」。
2. **AI 智能搜索问答**：`/search` 升级为自然语言问答（如「送妈妈的生日礼物 200 内」→ 结果），复用 `search` 模块。
3. **AI 首页编排**：根据角色 / 时段自动生成买家首页楼层。
4. **AI 选品 / 趋势洞察**：给商家推「近期热搜 → 建议上架品类」。

**优化**
- 个性化推荐从静态偏好升级为**实时行为序列推荐**（点击 / 加购 / 下单序列建模）。
- 智能客服**知识库自学习**：从商品 FAQ + 历史工单自动沉淀答案。

## 四、内容与社交（P2）

**新增**
1. **种草笔记 / 买家秀**：UGC 图文 + 挂商品链接，复用已有 `models/content.py` 延展。
2. **商品问答**：买家问、商家 / 其他买家答。
3. **社区 / 话题**：围绕品类的轻社区。

**优化**
- 评价支持**视频 / 图片 + 追评**（现有 `Review` 模型扩字段，前端 `ProductReviews.tsx` 接入）。
- 关注流（`Following.tsx`）升级为**动态信息流**（关注店铺上新 / 降价推送）。

## 五、商家与平台工具

**新增**
1. **数据看板增强**：转化漏斗、复购率、RFM 用户分层（Recharts 已引入）。
2. **子账号 / 权限细分**：商家给客服开只读 / 接单子账号。
3. **竞品 / 行业比价**：AI 抓取同类定价建议。

**优化**
- 商家报表除 CSV 外增加**图表预览 + 定时邮件**。
- 管理员审计看板增加**操作回放**与异常告警。

## 六、买家体验细节

**新增**
1. **降价提醒 / 到货通知**：收藏商品降价、缺货到货订阅。
2. **AR 试穿 / 3D 预览**：服装 / 家居类（图像模型可辅助）。
3. **浏览历史 + 最近常买**。
4. **个性化首页**：千人千面（与三联动）。

**优化**
- 通知中心升级为**分类标签页 + 免打扰**（现单列表）。
- 移动端适配与 **PWA**（可安装、离线缓存），提升「朋友能在线使用」的体验。

## 七、工程与可观测性（P2，求职作品加分项）

**新增**
1. **缓存层**：热数据（分类树、热搜、商品详情、推荐结果）加 Redis / 内存缓存，压测数据更好看。
2. **异步任务队列**：AI 生成、报表导出、邮件走 Celery / ARQ，避免阻塞请求。
3. **限流 + 熔断**：`slowapi` 占位已存在，落地全局限流与降级。
4. **可观测性**：结构化日志、Prometheus 指标 `/metrics`、错误告警。
5. **E2E 覆盖扩展**：当前 Playwright 仅 smoke + features，补支付 / 退款 / 营销关键路径。

**优化**
- i18n（`frontend/src/i18n`）补全剩余未翻译页面。
- 前端**按路由懒加载 + 骨架屏**，首屏性能。

---

## 建议落地顺序（todolist）

1. **P0 商业闭环**：真实支付接入 → 运费模板 → 缓存层 → 降价提醒（让作品「真能卖」、性能可量化）。
2. **P1 差异化**：AI 商品图 → AI 搜索问答 → 会员等级 → 签到任务 → 数据看板增强。
3. **P2 长期打磨**：直播 / 分销 → 种草社区 → AR 试穿 → 异步队列 / 可观测性。

> 穿插小项：i18n 完整化、PWA 移动适配，可随任意阶段顺带完成。

## 复用与约束（同 v1–v3）

- 所有写操作经 `audit_service.record()` 留痕；营销 / 库存 / 签到 / 支付事件经 `events.py` 总线解耦（通知、积分、审计）。
- 新增状态 / 流转一律进 `state_machine.py` 集中校验，防止越权。
- 演示数据严格匿名（角色通用化、账号 demo 占位），不写姓名 / 学校等个人信息。
- 每个大模块配套最小 pytest 用例；前端改动后 `npm run build` 验证；数据库变更必须新增 Alembic 迁移版本文件。

---

## v4 执行进度（changelog）

| 批次 | 模块 | 状态 | 提交 | 说明 |
|---|---|---|---|---|
| P0 | 缓存层 | ✅ | `77850f4` | 进程内 LRU + 热点接口接入 |
| P0 | 降价提醒 | ✅ | `77850f4` | 收藏商品降价经事件总线推送，顺带修复 `GET /notifications` 500 |
| P0 | 运费模板 | ✅ | `77850f4` | 商家运费模板 + 结算接入，顺带修复 `OrderOut` 漏传字段 |
| **P1** | **会员等级 + 任务中心** | ✅ | 见下 | 成长值→等级→折扣/包邮；签到任务中心发积分；订单完成累加成长值 |
| **P0** | **真实支付接入** | ✅ | 见下 | sandbox 网关 + 签名验真 + 幂等回调 + 原路退款；前端沙箱确认支付 |
| **P1** | **AI 商品图生成** | ✅ | 见下 | 文生图接口，未配置网关时 mock 占位图降级 |
| **P1** | **AI 智能搜索问答** | ✅ | 见下 | 自然语言→结构化筛选→召回，LLM/正则双实现 |
| **P1** | **数据看板增强** | ✅ | 见下 | RFM 分层 + 复购率 + 商家深度分析 |
| **P2** | **工程增强** | ✅ | 见下 | 限流全局落地 + /metrics 可观测性 + 异步队列 stub |
| **前端** | **会员/任务中心 + 支付 + 看板** | ✅ | 见下 | 会员中心、任务中心、沙箱支付、商家 RFM 页面 |

### 本次（会员等级 + 任务中心）改动要点
- 新增 `app/core/member_levels.py`：青铜/白银/黄金/钻石四档，配置驱动。
- `User` 增加 `growth_value`、`level` 字段；`user_tasks` 表（任务完成/领取状态）。
- `member_service`：成长值累加 + 等级重算、`get_membership` 权益查询。
- `task_service`：任务目录（每日签到/完善资料/完成首单/发表评价/收藏 3 件），行为自动检测完成，领取发积分（复用 `points_service`）。
- 接口：`GET /api/me/membership`、`GET /api/me/tasks`、`POST /api/me/tasks/{key}/claim`。
- 结算接入会员权益：会员专属折扣（青铜不打折，不影响既有订单）、黄金/钻石包邮。
- 订单完成事件累加成长值并自动重算等级。
- 迁移 `0005_member_tasks.py`（生产环境变量）；pytest 全绿（39 项）。
- 前端会员中心/任务中心页面已补齐（见下）。

### 本次（真实支付 + AI + 看板 + 工程 + 前端）改动要点
- **支付（P0）**：`Payment` 模型 + `payment_service`（sandbox 网关、HMAC 签名验真、`handle_webhook` 幂等、原路退款）+ 接口 `/payments/orders/{id}/pay`、`/status`、`/webhook/{gateway`、`/confirm`（沙箱）。退款事件自动标记支付流水 REFUNDED。迁移 `0006_payments.py`。
- **AI 商品图（P1）**：`image_service.generate_images` 文生图，配置 `IMAGE_API_KEY/BASE_URL` 时调用网关，否则返回确定性占位图；接口 `POST /products/{id}/ai-image`（商家，可 apply 首张为主图）。
- **AI 搜索问答（P1）**：`search_service.search_qa` 自然语言→解析价格/类目/关键词→召回商品并生成回答；配置 AI 密钥走 LLM，否则本地正则解析。接口 `POST /search/qa`。
- **数据看板（P1）**：`dashboard_service` 新增 `rfm_analysis`（高价值/忠诚/潜力/新客/流失风险）、`repurchase_rate`；`DashboardAnalytics` 增加 rfm/repurchase_rate/buyers；新增 `merchant_analytics` 与 `GET /merchant/dashboard/analytics`（RFM+复购率+趋势+Top 商品）。
- **工程（P2）**：`core/ratelimit.py` 设 `default_limits` 并经 `SlowAPIMiddleware` 全局落地（测试环境禁用）；`core/metrics.py` + `/metrics` 暴露 Prometheus 风格指标；`services/async_queue.py` 进程内异步任务队列 stub，`/admin/queue/stats` 观测。
- **前端**：`Membership.tsx`（会员等级 + 任务中心领取）、`Pay.tsx`（沙箱确认支付）、订单列表"去支付"按钮、商家看板 RFM/复购率卡片；`api/index.ts` 新增对应类型与函数。
- **测试**：新增 `test_payments.py`、`test_ai_features.py`、`test_dashboard_v4.py`，pytest 全绿（47 项）；`npm run build` 通过。
