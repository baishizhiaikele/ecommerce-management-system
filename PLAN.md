# AI 全托管小店 — 计划与状态

> 全栈电商管理平台：以电商为骨架（商品 / 购物车 / 订单状态机 / 三角色 RBAC / 仪表板），
> 以 **AI 深度集成** 为差异化灵魂（AI 店长一键生成文案定价、AI 智能客服、评论情感分析预警）。

## 技术栈

- 后端：FastAPI · SQLAlchemy 2.0(异步) · Pydantic V2 · JWT(bcrypt) · 事件总线
- 前端：React 18 · TypeScript · Vite · Ant Design 5 · Zustand · Tailwind · Recharts
- 数据库：开发 SQLite / 生产 PostgreSQL（同一 ORM，连接串经环境变量切换）
- AI：OpenAI 兼容接口；无 key 时自动降级为本地确定性 mock，主流程不中断
- 部署：单 Web 服务（Docker 多阶段构建，后端同源托管前端 `dist/`），`render.yaml` 一键部署

## 角色与权限（RBAC）

| 角色 | 能力 |
|---|---|
| buyer 买家 | 浏览/搜索、SKU 加购、下单（优惠券+积分抵扣）、收藏、关注店铺、评价/回复、积分成长、通知中心（WebSocket 实时推送）、申请退款、转人工工单、逛店铺、促销活动、个性化推荐 |
| merchant 商家 | 商品/SKU 管理、库存流水与低库存预警、AI 店长/营销文案/智能定价、营销活动创建、评价运营（回复/置顶/删除/分布）、发货、录入物流、客服工单、数据看板、订单报表 CSV/邮件 |
| admin 管理员 | 商品审核、用户管理、平台仪表板、审计日志与可视化看板、优惠券管理 |

## 核心能力（已落地）

- **认证与 RBAC**：JWT 双令牌、无感刷新、角色依赖注入，越权返回 403
- **商品 / 分类 / 库存**：分类树、商品 CRUD、多规格 SKU、库存流水 + 低库存预警
- **购物车 / 订单**：结算（优惠券+积分抵扣）、订单状态机（含预售定金、退款分支）、支付状态机
- **营销**：限时活动（秒杀/折扣/满减）、优惠券、会员等级与任务中心、运费模板
- **AI 差异化**：AI 店长（文案/定价）、AI 营销文案、AI 智能客服 + 转人工、AI 商品图、AI 搜索问答、个性化推荐
- **内容与社交**：关注店铺、收藏、评价（带图/情感分析）、通知（WebSocket 实时推送）、审计看板
- **工程品质**：Alembic 迁移、CI（pytest + build）、全局限流、`/metrics` 可观测、异步队列 stub、PWA、i18n、前端路由懒加载 + `manualChunks` 拆包

## 已完成里程碑

| 阶段 | 内容 | 说明 |
|---|---|---|
| v1 基础 | 三角色 RBAC + 订单状态机 + AI 降级 + 端到端冒烟 | 电商骨架跑通 |
| v2 拓展 | 图片上传、搜索增强、积分/会员、优惠券、收藏、通知、推荐、AI 营销/定价、多商家、报表、工单、退款、物流、审计看板、i18n | 功能面补齐 |
| v3 内容整改 | 种子数据充实（≥60 商品 / 多商家 / 评价分布）、首页模块、买家中心、关注店铺 | 站点「有内容」 |
| v4 商业闭环 | 真实支付(sandbox)/担保交易、运费模板、缓存、降价提醒、会员等级/PLUS、AI 商品图/搜索、数据看板增强、工程可观测、预售/发票/退款自动审核/子账号/比价/报表邮件/审计回放、个性化首页/通知免打扰/PWA/AR/E2E | 走向真实商业闭环 + AI 放大 |
| v4+ P3 进阶 | 退货退款重建(逆向物流+仲裁)、支付抽象+担保交易、AI 可行动代理层、秒杀+拼团/砍价、物流/到店自提、店铺装修、种草社区、付费会员 PLUS | 对标 2026 主流电商 |
| 工程与性能 | 数据库索引、N+1 审查、发票 PDF、WebSocket 弹幕、图片本地代理、通知外发渠道、相关性搜索+分面检索+联想、后端单测、前端单测、路由级懒加载、`manualChunks` 拆包、Docker/CI/gitleaks | 工程品质加分 |
| UI 美化 | 简约精选风设计系统（theme + CSS 令牌 + 工具类），全站（买/商/管）统一减负留白 | 视觉一致、首屏减负 |
| 安全审查 | 3 高危越权/泄露全部修复，13 中危 + 7 低危逐项落地（详见 `CODE_REVIEW_REPORT.md`） | 上线安全基线 |
| v5 体验优化 | 删除重复首页主题频道、积分页新增积分商城入口、签到防重复、订单收货地址显示修复、可领取优惠券去重、独立搜索页、首页榜单扩至 4 个、顶部导航通知入口整理、i18n 冗余文案清理 | 体验与一致性 |

## 安全基线（已落地）

- 认证：bcrypt 哈希、`SECRET_KEY` 必填、JWT 存 HttpOnly Cookie；认证限流（slowapi）。
- 越权修复：商品写归属校验（H1）、子账号权限绕过（H2）、发票 PDF 越权读（H3）、评价删除归属（M8）、库存归属（M9）。
- 资金安全：支付确认仅 sandbox（M1）、退款金额夹紧（M2）、优惠券并发行锁（M3）、积分下限+行锁（M13）、状态流转锁顺序防死锁（M4）。
- 性能/硬化：N+1 批量预取（M5）、列表分页（M6）、WebSocket `is_active` 校验（M7）、前端外链协议校验（M10）、安全响应头 + 请求体上限、CI 密钥扫描。
- 完整清单与修复记录见根目录 `CODE_REVIEW_REPORT.md`。

## 路线图状态（已核对代码，2026-07-31）

> 以下逐项核对实际代码/测试，标记：✅ 已落地 · ⚠️ 仅 stub/占位 · ❌ 未做。

### 早已完成（已从路线图移除）
- ✅ 运费模板、到店自提核销、实时行为序列推荐、知识库自学习、会员等级/PLUS、直播带货、分销裂变、种草社区、AR 试穿、E2E 关键路径覆盖。
- ✅ **P2 体验增强（2026-07-31 收尾）**：直播分销玩法扩展（商家端改直播价/置顶/切讲解/移品/AI 话术 + 直播间小黄车「分享赚佣金」闭环）、AR 试穿增强（商品 `ar_enabled`/`ar_overlay_url` 字段 + 轻量零依赖 WebAR 叠加组件，已存在 E2E 用例覆盖）、E2E 覆盖扩展（`e2e/flows.spec.ts` 新增浏览→加购→下单 / 种草推荐流→点赞 / 直播→分享赚佣金 三条核心闭环，共 15 条 E2E 用例）。

### ❌ 真正待办（下一步候选，按 ROI 排序）
- **种草社区推荐流/商业化闭环**：✅ 已完成（推荐流 + 商品反查 + 笔记挂车推广码 + 订单归因佣金），见上方「已落地」说明。
- **真实支付密钥注入 + 生产支付确认放行**：骨架（Stripe/WxPay Provider + 签名校验）已完成，待注入真实密钥并解除 sandbox 确认限制（M1 安全约束，需显式开关）。

### ✅ 已落地（代码已就位，非阻塞待深化）
- **真实支付生产化**：`StripeProvider` 真实 SDK 集成骨架（有密钥走官方验签，无密钥降级自签 HMAC）+ `WxPayProvider` 沙箱；生产支付确认放行守 M1 安全约束（仅 sandbox）。
- **多仓发货**：`Warehouse`/`InventoryByWarehouse` 模型 + `allocate_warehouse` 就近路由（同区优先/距离排序/默认仓兜底）+ 测试已落地。
- **Redis 缓存层**：`cache.py` 默认启用 Redis（`REDIS_URL` 默认 `redis://localhost:6379/0`），惰性探活 + 进程内 LRU 降级；docker-compose 已含 redis 服务。
- **异步队列**：`async_queue.py` 已接入 Redis list broker（`run_worker` 后台消费）+ 进程内降级，默认 REDIS_URL 可达即走 Redis。
- **可观测性 + 外部 APM**：`/metrics` 业务计数器 + 进程资源指标 + **请求延迟直方图（Prometheus 风格）**；`/health` 探测 DB+缓存 + 告警列表。链路追踪已接 **OpenTelemetry（OTLP）**，可选开启：`OTEL_ENABLED=true` + `OTEL_EXPORTER_OTLP_ENDPOINT` 即向 Jaeger/Collector 上报 span，调度循环周期推送进程内指标到 OTLP。依赖缺失/未开启时完全降级为 no-op，本地与 CI 零依赖可跑。详见 P1-7/路线图「可观测性接外部 APM」。
- **种草社区**：✅ 审核闭环 + 推荐流 + 商业化闭环全部落地（见上方说明）。
  - 推荐流：`GET /notes/feed` 按「点赞热度+近 7 天时间衰减」综合排序；`GET /notes/for-product/{pid}` 商品反查被种草笔记（商品详情「种草」标签页）。
  - 商业化闭环：作者 `POST /notes/{id}/attach-affiliate` 为挂车商品生成专属推广码 → 笔记卡片分享链接与商品卡点击均归因（`/affiliate/track`）；下单 `POST /orders/checkout` 携带 `affiliate_code` 写入订单，`grant_commission` 新增「订单自带推广码」归因优先级（无需点击绑定也能结算佣金）。前端 Discover 推荐流改造 + 作者「推广赚佣金」按钮 + ProductDetail 种草标签页已落地。测试 `test_seed_commerce_loop.py` 覆盖端到端闭环。
- **AI 商品图**：✅ 接真实图床（P1-7 收尾）。`/products/{id}/ai-image` 调用网关（通义万相/OpenAI 风格）生成白底图/场景图，**无论网关还是离线降级，最终图片都落本地图床** `/api/images/bed/{hash}.png` 并返回稳定 URL（生产只需把 `IMAGE_BED_DIR` 指向对象存储/外部图床挂载目录即可），彻底摆脱对易失第三方短链的依赖；离线环境用确定性占位图落床，整条「生成→落床→挂商品」链路可端到端测试（`test_image_bed.py`）。

## 下一步路线图（真实待办）

1. **P0 生产化**：真实支付密钥注入 + 生产支付确认放行（已完成骨架，待密钥）；AI 商品图接真实图床（✅ 已完成）
2. **P1 深化**：可观测性接外部 APM（✅ 已完成 OTLP tracing + 延迟直方图；Prometheus 远端抓取可在 `/metrics` 之上由外部 scrape，无需代码改动）
3. **P2 体验**：✅ 直播分销玩法扩展（商家端改价/置顶/切讲解/移品/AI话术 + 直播间分享赚佣金）、AR 试穿增强（商品字段 + 轻量 WebAR 组件）、E2E 覆盖扩展（新增 3 条核心闭环用例，共 15 条）

## 文档索引

- `README.md` — 项目总览、接口一览、安全、部署（Render / Docker）
- `GETTING_STARTED.md` — 新手六阶段教程（环境 → 结构 → 实操 → 排错 → 部署）
- `CODE_REVIEW_REPORT.md` — 静态代码审查报告（高危/中危/低危清单 + 修复实施记录）
- `plans/DEVLOG.md` — 各阶段功能落地、优化与修复的详细执行日志（备查）

## 复用与约束

- 所有写操作经 `audit_service.record()` 留痕；营销 / 库存 / 签到 / 支付事件经 `events.py` 总线解耦（通知、积分、审计）
- 新增状态 / 流转一律进 `state_machine.py` 集中校验，防止越权
- 演示数据严格匿名（店铺 / 用户通用化，账号 demo 占位），不写姓名 / 学校等个人信息
- 数据库变更必须新增 Alembic 迁移版本文件，不再依赖 `create_all` 演进

## 2026-07-31 后端 pytest 8 失败根因修复（已验证通过）

> 前端 C5 表单校验 / tsc 基线 5 错误修复完成后，跑后端 pytest 发现 8 个失败，全部非前端改动引入，根因如下并已修复：

### 根因与修复
1. **`MissingGreenlet` ×6**（`test_escrow_p3`×2、`test_payments`×2、`test_pickup_p3`×2、`test_returns_p3`×1）：
   - 根因：`payment_service.handle_webhook` 用 `await db.get(Order, ...)` 加载订单，**未 eager-load `items` 关系**；后续 `order_service.transition_status` 访问 `order.items` 触发 lazyload，在 webhook 上下文无法 spawn greenlet → 抛 `MissingGreenlet`，导致状态流转失败/回滚（退款状态机也卡在 `refund_requested`）。
   - 修复：在 `transition_status` 入口加 `await db.refresh(order, ["items"])` 作为防御，确保 items 已加载，无论调用方是否 eager-load 都安全。
2. **`assert 403` ×1**（`test_knowledge`）：买家关闭自己工单期望 200。
   - 根因：`support_service.close_ticket` 收紧为「仅商家可关闭」，过度收紧导致买家无法关闭自己的工单（RBAC 回归）。
   - 修复：允许 **商家关闭分配给自己的工单** 或 **买家关闭自己发起的工单**，其余角色 403。
3. **`refunded != refund_requested` ×1**（`test_returns_p3`）：未发货仅退款期望中间态。
   - 根因：Tier1/2 新增「小额低风险仅退款自动秒退」（`AUTO_REFUND_MAX_AMOUNT=100`），当商品金额 ≤100 时申请退款直接转为 `refunded`，旧测试断言写死 `refund_requested`。该失败实质也是 `MissingGreenlet` 的连带表现，随 #1 修复 + 测试断言兼容后通过。
   - 修复：测试断言改为 `status in ("refund_requested", "refunded")`，仅未自动秒退时验证人工审核链路。

### 验证结果
- 5 个失败文件单独跑：全绿（EXIT=0）。
- **完整后端 pytest 套件**：全绿（EXIT=0），无回归。
- 改动文件：`backend/app/services/order_service.py`、`backend/app/services/support_service.py`、`backend/tests/test_returns_p3.py`。

### 本轮未做（下一阶段候选）
- **MODIFICATION_PLAN 4.6 反馈与撤销**（防抖乐观更新 / 骨架屏 / 登录回跳 / WS 重连 / 撤销 Snackbar / 404 页）：前端 UX 精致度。购物车防抖乐观更新（300ms）+ 撤销 Snackbar 已落地；404 页/路由懒加载/骨架屏已存在。
- **MODIFICATION_PLAN 4.7 一致性清理**（图标库收敛 / 设计 token / LanguageProvider 去重 / api 拆分等）：属架构长期债，范围独立，未在本轮混入。
- 二者建议作为「阶段 D（UX 精致度）」单独规划，避免一次提交混入大量半成品重构。
- Tier1.1 真实 Alembic 迁移（`variant_id` 等）：已补 `0009_demo_columns` 补偿迁移，将 `_ensure_demo_columns` 的 37 个列正式纳入 Alembic 版本链（`_ensure_demo_columns` 退居最终兜底，幂等）。后续 `alembic revision --autogenerate` 可正确比对。

## 2026-07-31 部分界面打不开（HTTP 500）根因修复

> 用户反馈「有些界面打不开」。实测后端 8000 与前端 5173 均正常存活，但批量探测各角色核心 API 发现 2 个接口稳定 500，对应页面无法加载。

### 根因
1. **`/api/points/history` → 500**（买家「积分」页）：`PointLogOut` 缺少 `model_config = ConfigDict(from_attributes=True)`，FastAPI 用 response_model 从 ORM 对象构造时拒绝（ValidationError: not a valid dict/instance）。
2. **`/api/admin/reviews/negative` → 500**（管理员「差评管理」页）：
   - 直接原因：`Review` 模型新增了 `report_reason` 列，但旧库 `reviews` 表无此列，且未纳入 `_DEMO_COLUMN_DEFS` 兜底 → `no such column: reviews.report_reason`。
   - 连带：`ReviewOut.username` 需从 `Review` 取 username，但 `Review` 模型没有 `username` 属性，且各查询未 eager-load `user` 关系 → 序列化时 lazyload 会 MissingGreenlet。

### 修复
- `schemas/points.py`：`PointLogOut` 加 `model_config = ConfigDict(from_attributes=True)`。
- `schemas/review.py`：`ReviewOut` 加 `model_config = ConfigDict(from_attributes=True)` + 导入 `ConfigDict`。
- `models/review.py`：`Review` 加 `username` 只读 property（从已加载的 `user.username` 取）。
- `main.py`：`_DEMO_COLUMN_DEFS` 补 `("reviews","report_reason","ALTER TABLE reviews ADD COLUMN report_reason TEXT")`（启动演进兜底）。
- `services/review_service.py` 与 `api/admin.py`：所有返回 `Review` 给 `ReviewOut` 的查询统一 `selectinload(Review.user)`（negative_reviews、list_product_reviews、list_merchant_reviews），并在 create/reply/pin/mark_helpful/report/append 返回前 `await db.refresh(review, ["user"])`，避免 lazyload 与属性冲突。
- 注意：原 `list_product_reviews` 里手动 `r.username = ...` 注入方式与新增 property 冲突，已移除并改用 selectinload。

### 验证
- 重启后端后，对 buyer/merchant/admin 三角色共 **35 个核心接口** 全量探测：全部 **200**，零 500，无回归。
- 改动文件：`schemas/points.py`、`schemas/review.py`、`models/review.py`、`main.py`、`services/review_service.py`、`api/admin.py`。
- 说明：`/api/merchant/products` 对 admin 返回 403 属预期（RBAC 正确，非 bug）。

### 部署提示
- 改动需**重启后端**才生效（`.env`/代码均在进程启动时加载）。
- 旧库会在启动 `lifespan` 的 `_ensure_demo_columns` 阶段自动补齐 `report_reason` 列，无需手动迁移。
- 仍需关注：其它新增模型列若未纳入 `_DEMO_COLUMN_DEFS`，在旧库上仍可能 500（本次已全量探测 buyer/merchant/admin 代表接口均通过）。

---

## 对标主流电商优化方案（2026-07-31 起草）

> 对标对象：淘宝/京东（购物体验、支付、物流）、拼多多（增长/拼团/裂变）、抖音电商（直播带货闭环、AI 导购）。
> 现状已覆盖：商品/SKU/订单状态机/RBAC/营销/AI 客服/推荐/社区/直播骨架等。以下按 **P0（上线硬门槛）→ P1（转化与差异化）→ P2（留存与工程）** 三档列出。

### P0 基础设施与生产化（最先落地，决定"能否真实卖货"）

| # | 痛点 | 对标 | 方案 | 状态 |
|---|---|---|---|---|
| P0-1 | 支付是自签 HMAC 占位壳，微信/支付宝未接 | 淘宝/京东全渠道支付 | 接入 Stripe 真实 SDK 验签 + 微信支付沙箱；生产支付确认放行 | ✅ **已落地（可切换骨架：有密钥走真 Stripe SDK + Webhook 验签，无密钥降级自签 HMAC；WxPayProvider 沙箱已就位）** |
| P0-2 | 仅单仓/自提，无多仓 | 京东多仓就近发货 | `Warehouse` + `InventoryByWarehouse` 分仓库存 + 下单路由最近有货仓 | ✅ **本轮已落地** |
| P0-3 | 缓存进程内 LRU，Redis 默认没起 | 大促高并发 | docker-compose 起 Redis + config 默认启用 + `cache.py` 双后端 | ✅ **本轮已落地** |
| P0-4 | 异步队列是线程 stub | 削峰/解耦 | 基于 Redis 的轻量 worker（保留 `enqueue` 兼容签名） | ✅ **本轮已落地** |

### P1 购物体验与转化（直接影响 GMV）

| # | 痛点 | 对标 | 方案 |
|---|---|---|---|
| P1-1 | 搜索缺语义/以图搜图 | 淘宝拍立淘 | 多模态向量检索，图搜商品 |
| P1-2 | 缺购物车凑单/满减进度条 | 京东凑单提示 | 结算页"还差 X 元享满减" + 凑单推荐 |
| P1-3 | 缺商品对比/历史价格曲线 | 慢慢买 | 比价页 + 价格走势图（已有比价 stub，深化） |
| P1-4 | 直播带货未闭环 | 抖音小黄车 | 直播间挂车 + 闪购 + 直播专属券 |
| P1-5 | 售后进度无可视化 | 淘宝极速退款进度条 | 退款/退货状态机前端时间轴 |
| P1-6 | 地址无智能解析/默认置顶 | 京东地址库 | 粘贴文本识别省市区 + 默认地址 |

### P1 商家与平台效率

| # | 痛点 | 对标 | 方案 |
|---|---|---|---|
| P1-7 | AI 商品图无 key 出占位图 | 淘宝 AI 作图 | 接真实图床，一键生成场景图/白底图（需密钥） |
| P1-8 | 数据看板未下钻 | 京东商智 | GMV/转化/漏斗可下钻图表（看板已有，深化） |
| P1-9 | 缺库存预警自动补货 | 智能补货 | 基于销量预测生成补货建议单 |
| P1-10 | 缺店铺装修 | 淘宝旺铺 | 商家自定义首页楼层/banner（装修 stub 深化） |

### P1 AI 差异化放大（系统灵魂）

- **AI-1** AI 客服主动营销（按画像推券/推搭配套餐）
- **AI-2** 个性化首页 LLM 决策配 key 自动启用 + A/B 实验框架衡量 CTR
- **AI-3** AI 直播数字人/脚本自动播报
- **AI-4** 评论摘要/「问大家」聚合（基于评价生成）

### P2 留存与增长

- **P2-1** 拼团/砍价完整性补齐（成团超时退款、砍价助力链路）
- **P2-2** 签到日历可视化 + 连续天数加成
- **P2-3** 裂变分享海报 + 邀请返佣（Affiliate 深化）
- **P2-4** push/短信/邮件外发渠道（通知外发 stub 落地）
- **P2-5** 会员权益差异化（PLUS 会员价/包邮/专属客服）

### P2 工程与可观测

- tracing/告警看板（当前仅 `/metrics` + 结构化日志）
- 前端 UX 精致度：✅ 购物车删除撤销 Snackbar（乐观隐藏+5s Undo+卸载清理）已落地；404 页/路由懒加载+Suspense 骨架屏已存在；防抖乐观更新（购物车改数量 300ms 防抖+失败回滚）已存在。`tsc --noEmit` 全量 0 错误（修复了 AIMall/ProductDetail 等既有类型错误）。
- 真实 Alembic 迁移替代 `_ensure_demo_columns` 兜底（技术债）：✅ 已补 `0009_demo_columns` 接管 37 列，`_ensure_demo_columns` 降级为最终兜底
- E2E 覆盖扩展（✅ `e2e/flows.spec.ts` + 既有 12 条，共 15 条用例）、前端单测

### 落地节奏

1. **P0**：支付 + 多仓 + Redis + 队列（多仓/Redis/队列本轮完成；支付因缺密钥留待接入）
2. **P1**：图搜、凑单、直播闭环、AI 商品图、数据下钻
3. **P2**：拼团砍价深化、裂变、可观测

### 本轮（2026-07-31）实际交付

- **多仓发货**：新增 `models/inventory.py` 的 `Warehouse` / `InventoryByWarehouse`；`seed.py` 注入 3 个区域仓 + 分仓库存；`inventory_service` 增加 `allocate_warehouse` 按收货地就近 + 有货优先路由；下单时写订单项发货仓（不影响既有 `product.stock` 汇总语义）。
- **Redis 缓存默认启用**：`docker-compose.yml` 增加 `redis` 服务；`config.py` 默认 `REDIS_URL=redis://localhost:6379/0`（无 Redis 时优雅降级进程内 LRU）；`cache.py` 双后端就绪。
- **异步队列真实化**：`async_queue.py` 升级为基于 Redis 的轻量 worker（pub/sub + 后台任务消费），保留 `enqueue(fn, *args)` 兼容签名；提供 `worker` 启动入口与 `run_worker` 协程。


## 文档索引

| 文档 | 说明 |
|---|---|
| `README.md` | 项目门户（快速开始、技术栈、接口一览） |
| `PLAN.md` | 本文档（权威状态摘要） |
| `GETTING_STARTED.md` | 新手六阶段教程 |
| `CODE_REVIEW_REPORT.md` | 安全审查报告与修复记录 |
| `plans/PROJECT_PLAN.md` | 完整演进记录 + 路线图 |
| `plans/PERF_TESTING.md` | 性能压测与 PostgreSQL 切换指南 |
