# 项目优化路线图（Optimization Plan）

> 背景：项目已完成内容整改（P0 数据充实 + P1 首页重构）、全量前后端契约审计（确认无 404/422 错配）、购物车 SKU 展示增强。本文汇总"还能继续优化"的点，按优先级与投入排序，供后续迭代参考。
>
> 约束：作为求职作品集，演示数据保持匿名化、不写入个人身份信息（见项目记忆）。

## 优先级说明
- **P0**：快速见效、风险低，建议先做。
- **P1**：价值显著，需一定投入。
- **P2**：进阶增强 / 作品集加分项，按需推进。

## 一、前端工程化（P0）
1. **路由级代码分割**：`frontend/src/main.tsx` 当前无任何 `React.lazy` / `Suspense`，首屏会打包全部 ~80 个页面。改为按路由分包懒加载，可显著降低首屏 JS 体积与白屏时间。
2. **前端单元测试**：当前零单测（仅有 3 个 e2e 冒烟）。引入 Vitest + React Testing Library，优先覆盖纯逻辑与关键组件——购物车金额计算、优惠券抵扣、结算金额聚合、购物车 SKU 展示等。

## 二、后端质量与性能（P0 / P1）
3. **N+1 查询审计**：购物车列表的 N+1 已修复；需排查 `orders` / `products` / `merchant` 等列表端点的关联加载，统一使用 `selectinload` / `joinedload`，避免循环内逐条查库。
4. **索引与缓存校验**：核对热点查询列（`user_id`、`merchant_id`、`status`、`category_id`、`created_at`）是否都有索引；首页、分类、热榜等热读加短 TTL 缓存（已有缓存层则补充命中率监控）。
5. **统一分页与响应头**：所有列表接口返回统一分页 meta（`page` / `page_size` / `total`）；为静态资源与热读加 `Cache-Control`，提升重复访问性能。

## 三、搜索与发现（P1）
6. **分面检索**：当前搜索仅有 `keyword` 模糊 + 热搜 + AI 问答。补充筛选维度——价格区间、评分、多级分类、排序（销量 / 价格 / 最新），并在前端加筛选栏与排序控件。
7. **搜索联想与"猜你喜欢"**：输入框实时联想、相关商品 / 看了又看 / 搭配推荐，提升转化。

## 四、容器化与 CI/CD（P1，作品集加分）
8. **本地一体化栈**：已有 `backend/Dockerfile`；补充 `docker-compose.yml`（Postgres + backend + frontend）与前端 `Dockerfile`（nginx 静态服务），统一本地与线上（Render）环境，降低"我本地能跑"问题。
9. **GitHub Actions CI**：PR 自动跑 后端 pytest + 前端 `tsc`/`vite build` + 依赖审计（`pip-audit` / `npm audit`）+ lint，作为作品集的工程化硬实力证明。

## 五、安全与可观测（P1 / P2）
10. **安全响应头**：加中间件注入 `CSP` / `HSTS` / `X-Content-Type-Options` / `X-Frame-Options`，并限制请求体大小。
11. **结构化日志与错误追踪**：统一 JSON 结构化日志、暴露 `/metrics`，生产环境可选接 Sentry 类错误聚合。
12. **密钥巡检**：确认 `.env` 已 gitignore；CI 中加 secret 扫描，防止误提交凭证。

## 六、体验与可访问性（P1 / P2）
13. **图片管线**：上传时压缩、生产环境改用对象存储（S3 兼容）、前端图片懒加载 + 模糊占位，减少带宽与首屏阻塞。
14. **无障碍 a11y**：语义化标签、焦点管理、`aria-*`、键盘可达，提升专业度与合规性。
15. **i18n 补全**：校验 `en` 文案缺失键（尤其新增的"规格"等），视需要增加更多 locale。

## 七、业务深度（P2，按需）
16. 优惠券自动凑单 / 叠加规则与冲突校验。
17. 评价增强：有用投票、评价图片、商家回复。
18. 库存预警与到货通知、缺货订阅。
19. 订单发票 / 小票 PDF 导出；愿望单降价提醒。
20. AI 深化：个性化推荐（含冷启动处理）、AI 商品图生成、多轮客服会话记忆、商家趋势自动周报。

## 建议执行顺序
- **第 1 批（约 1 周，P0）**：1、2、3、4 —— 工程化与性能，风险低、见效快。
- **第 2 批（约 2 周，P1）**：6、8、9、10、13 —— 搜索 / 部署 / CI / 安全 / 图片，作品集硬实力。
- **第 3 批（按需，P2）**：5、7、11、12、14、15、16–20 —— 进阶增强。

> 关联文档：`PLAN.md`（主路线图）、`plans/CONTENT_REMEDIATION.md`（内容整改方案，已完成）。

## 执行记录
- **2026-07-28（P0 批次）**：核查发现 P0-1/3/4 已在代码库中实现，无需新增：
  - P0-1 路由级代码分割：`App.tsx` 已对 ~40 个路由使用 `React.lazy` + `Suspense`（仅首屏外壳直引）。
  - P0-3 N+1 审计：全量 multiline 扫描 0 命中；`list_orders`/`cart` 均批量加载，`order/coupon/support/chat` 服务已用 `selectinload`。
  - P0-4 索引与缓存：`products`(merchant/status/category)、`orders`(buyer/status)、`review`(product)、`inventory`(product+time) 等热点列均有索引；`products` 列表已接缓存。
- **2026-07-28（P0-2 落地）**：新增 Vitest + RTL 基建；将购物车金额计算（小计/优惠券/积分/应付）从 `Cart.tsx` 抽取为 `src/utils/cart.ts` 纯函数并重构接入；补充 `src/utils/__tests__/cart.test.ts`（12 例）、`format.test.ts`（3 例），共 15 例全部通过；`tsc --noEmit` 0 错误。脚本：`npm test`（=`vitest run`）。
- **2026-07-28（P1/P2 全量执行）**：安全优先、保持前后端契约不变，逐项落地如下（验证：后端 pytest 49 例全过；前端 tsc 0 错、Vitest 15 例全过、vite build 成功）。
  - **P1-10 安全响应头 + 请求体限制**：在 `app/core/security.py` 原有 `hash_password`/HttpOnly Cookie（S4）基础上，新增 `SecurityHeadersMiddleware`（同源 CSP、X-Frame-Options=DENY、X-Content-Type-Options=nosniff、Referrer-Policy、Permissions-Policy、HTTPS 下 HSTS）与 `MaxBodySizeMiddleware`（非 multipart 请求体默认 10MB 上限）；静态资源 `/uploads`、`/assets` 注入一年不可变缓存头。测试环境自动跳过 CSP/HSTS。
  - **P1-5 统一分页 meta + 缓存头**：`GET /products` 返回 `X-Total-Count / X-Page / X-Page-Size` 响应头（不改动 JSON 体，兼容现有前端）；静态资源缓存头由安全中间件统一处理。
  - **P1-6 分面检索**：后端 `search_service.facets` + `GET /search/facets`（类目计数、价格区间、评分分桶、排序选项）；`list_products` 新增 `min_rating` 过滤（基于评价均分的子查询，避免 N+1）；前端 Market 新增「评分」筛选项与类目计数展示。
  - **P1-7 搜索联想**：后端 `search_service.suggest` + `GET /search/suggest`（热门关键词前缀 + 商品名匹配）；前端搜索框升级为 `AutoComplete` 联想下拉。
  - **P1-8 docker-compose**：新增 `docker-compose.yml`（Postgres 16 + 后端一体栈，后端镜像内已构建前端并同源托管）、`.env.example`（SECRET_KEY 必填、AI/DB 可选）；`SECRET_KEY` 缺失则启动失败，安全可控。
  - **P1-9 + P2-12 CI / 密钥扫描**：新增 `.github/workflows/ci.yml`（pytest / tsc / vitest / vite build / 依赖审计 / gitleaks 密钥扫描）；`.gitleaks.toml` 内置规则 + 演示占位白名单。依赖审计与密钥扫描 `continue-on-error`，避免传递性 CVE 阻断流水线。
  - **P2-12 修复（gitleaks 配置失效）**：原 `.gitleaks.toml` 规则结构错误（`[rules.name]` 点号表 + 列表式 allowlist），导致 gitleaks 无法加载配置、密钥扫描实际从未执行（被 `continue-on-error` 掩盖）。已改为 gitleaks 要求的 `[[rules]]` 数组 + 显式 `id` + map 形式 `allowlist`；并将正则键名改为非捕获组、值改为捕获组（使 `Secret` 为真实值，allowlist 才能按值排除误报）。本地用 gitleaks 8.30.1 验证：18 commits 全量历史扫描「no leaks found」，且自定义规则能正确命中 `SECRET_KEY=<真实密钥>`；同时排除本地 `sqlite+aiosqlite` 测试库连接串与 `create_access_token` 函数调用两类误报。另确认 `.env` / `.env.*` 已 gitignore，仅 `.env.example` 纳入版本管理。
  - **P1-13 图片管线**：上传写入后由 `Pillow` 压缩（JPEG q82 / PNG optimize / WEBP q82，gif 与安全降级跳过）；`requirements.txt` 增加 `Pillow`、`reportlab`。前端 `ProductImage` 加 `loading="lazy"` + `decoding="async"`。对象存储（OSS/S3）为配置门控项，需外部凭证，当前沿用本地文件系统，未硬编码任何密钥。
  - **P2-11 结构化日志**：新增 `app/core/logging_config.py` 单行 JSON 日志；`main.py` 生命周期在非测试环境启用，便于日志采集。
  - **P2-14 a11y**：新增「跳过导航」链接 + `MainLayout` 主内容 `id="main-content"` 焦点锚点；图片懒加载。
  - **P2-15 i18n**：补全 `market.rating`（zh/en），缺失键仍走 zh 兜底。
  - **P2-16 优惠券叠加规则**：已为单券（每单最多 1 张，`MAX_COUPONS_PER_ORDER=1`）；结算对未达门槛的优惠券返回 400。新增配置项以明确规则。
  - **P2-17 评价增强**：`Review` 新增 `helpful_count`/`report_count`/`report_reason`；`review_service.mark_helpful`/`report_review` + `POST /products/reviews/{id}/helpful`、`/report` 端点；迁移兼容 ALTER 已加入 `_ensure_demo_columns`。
  - **P2-18 库存预警**：`Product` 新增 `warning_threshold`（默认 10），`inventory_service` 优先使用商品自身阈值（`_threshold` 回退全局常量）；低库存提醒按商品阈值触发。
  - **P2-19 订单 PDF**：新增 `GET /merchant/reports/orders/pdf`（reportlab 生成订单清单 PDF）；reportlab 未安装时安全返回 501。
  - **P2-20 愿望单降价通知**：已在库（监听 `product.price_changed` 事件，推送降价通知给收藏用户），本次核查确认无需新增。
  - **安全/可行性收口**：修复 `cart.py` 缺失 `Optional` 导入（上一轮 SKU 增强遗留、会导致整个应用无法启动）；新增列均通过 `_ensure_demo_columns` 幂等 ALTER 兼容存量库；所有新增外部依赖（Pillow/reportlab）容错降级；密钥仅经 `.env`（已 gitignore）注入，未写入任何可读产物。
