# 开发日志（Dev Log）

> 本目录汇总项目各阶段的功能落地、优化与修复记录，作为 `PLAN.md`（计划与状态总览）的补充备查材料。
> **权威状态摘要以 `PLAN.md` 为准**；安全审计报告见根目录 `CODE_REVIEW_REPORT.md`。
>
> 约定：计划文档统一存放于项目工作目录（`plans/`），与代码一同纳入版本管理，便于随代码查看与复用。

---

## 1. v1 → v2 · 基础骨架与功能拓展

- **v1 基础**：三角色 RBAC（buyer / merchant / admin）+ 订单状态机 + AI 降级（无 key 走本地确定性 mock）+ 端到端冒烟，电商骨架跑通。
- **v2 拓展**：图片上传、搜索增强、积分 / 会员、优惠券、收藏、通知（WebSocket 实时推送）、个性化推荐、AI 营销 / 定价、多商家、报表、工单、退款、物流、审计看板、i18n，功能面补齐。

## 2. v3 · 内容扩展与「内容太少」整改

- **蓝图**（`P3_ROADMAP.md`，功能已在 v3/v4 落地）：营销中心、多级分类树、库存流水与预警、商家数据看板、买家个人中心、关注店铺等缺口路线。
- **整改**（`CONTENT_REMEDIATION.md`，验收 2026-07-28）：
  - P0 数据充实：二级分类 12→17、商品 52→61、评价 3~6 条（含带图 / 差评、1~5 星分布）、4+ 商家、Banner / 促销 / 优惠券 / 买家侧数据全部补齐，演示图片改用 picsum / Wikimedia 真实照片风格。
  - P1 首页重构：轮播 Banner、多级分类、限时秒杀、排行榜、领券中心、店铺街、主题频道、猜你喜欢。
  - P2 商品详情 / 店铺页、P3 买家个人中心（地址簿 / 积分成长 / 签到 / 消息 / 收藏）、P4 营销与数据看板。
  - 验收结论：首页六大模块齐备，任意详情页 ≥3 条评价；`npm run build` 通过、关键链路走通、后端 98 项测试通过；演示数据零个人信息。

## 3. v4 · 商业闭环（六批次，`V4_REMAINING.md`，已提交 `30b328c` / `b8936f4`）

- **批次 1 内容社交 + 买家体验**：商品问答 Q&A、浏览历史 + 最近常买、评价增强（图 / 视频 / 追评）、关注流动态、i18n 完整化。
- **批次 2 AI 深化**：实时行为序列推荐、AI 首页编排、客服知识库自学习、AI 选品 / 趋势洞察。
- **批次 3 营销增长**：分销 / 裂变佣金、促销活动扩展（满赠 / N 元任选 / 第二件半价）、直播带货 / AI 数字人弹幕边看边买。
- **批次 4 交易履约**：预售定金（膨胀 + 尾款生成订单）、电子发票（个人 / 企业抬头）、小额退款自动审核秒退。
- **批次 5 商家平台工具**：子账号权限矩阵、AI 比价、经营报表图表 + 定时邮件、审计回放 + 规则告警。
- **批次 6 买家体验 + 工程**：个性化首页、通知分类免打扰、PWA、AR 试穿、E2E 关键路径扩展。
- 全部 6 批次完成后后端 98 测试通过、前端 tsc + build 通过。

## 4. 工程与性能优化（`OPTIMIZATION.md`）

- **P0 批次（核查 + 落地）**：
  - 经核查，路由级代码分割（`App.tsx` 已 `~40` 路由 `React.lazy` + `Suspense`）、N+1 审计（全量扫描 0 命中）、热点列索引与缓存（已在库）均已在代码库实现，无需新增。
  - 前端单测基建：新增 Vitest + RTL，将购物车金额计算抽取为 `src/utils/cart.ts` 纯函数，补充 15 例单测全过；`tsc --noEmit` 0 错。
- **P1 / P2 批次**（验证：后端 pytest 49 例全过、前端 15 例全过、vite build 成功）：
  - 安全响应头中间件（CSP / X-Frame-Options / nosniff / Referrer-Policy / HSTS）+ 请求体 10MB 上限。
  - 统一分页 meta 响应头（`X-Total-Count / X-Page / X-Page-Size`）+ 静态资源一年不可变缓存。
  - 分面检索（`/search/facets` + `min_rating` 过滤）、搜索联想（`/search/suggest` + AutoComplete）。
  - `docker-compose.yml`（Postgres + 后端一体栈）+ `.env.example`（SECRET_KEY 必填、AI/DB 可选）。
  - GitHub Actions CI（pytest / tsc / vitest / build / 依赖审计 / gitleaks 密钥扫描）+ 修复 gitleaks 配置使其真正生效。
  - 图片管线：上传 Pillow 压缩 + 前端懒加载；结构化 JSON 日志；a11y（跳过导航 / 焦点锚点）；i18n 缺失键补全；优惠券叠加规则（每单上限 1 张）；评价增强（有用 / 举报）；库存预警阈值；订单清单 PDF；愿望单降价通知（已在库）。

## 5. UI 大幅美化 · 简约精选风（2026-07-29，`2026-07-29-ui-redesign-design.md`）

- 目标：从信息密集的传统货架风转向 Apple / Shopify / Nordstrom 式简约精选风，全站（买 / 商 / 管）统一。
- 设计系统：`frontend/src/theme.ts` 加大圆角（12/16）、柔和阴影、`--ease-soft` 曲线；`index.css` 新增 `--space-section(56/72px)`、`--radius-xl/2xl`、`--shadow-*` 令牌与 `.page-shell` / `.stack` / `.section-head` / `.eyebrow` / `.hero-shell` / `.rail-scroll` / `.product-card` / `.card-soft` / `.chip` 等工具类。
- 实施：设计系统 → 旗舰首页 Market 减负 → MainLayout 节奏 → 核心买家页 → 商家后台 → 管理端 → 构建验证（tsc + vite build）。
- 验收：首屏区块显著减少、留白充足；商品卡尺寸 / 圆角 / 阴影统一且 hover 柔和抬升；全站视觉语言一致；构建成功。

## 6. 安全代码审查与修复（`CODE_REVIEW_REPORT.md`，审查 2026-07-29）

- **高危（已修）**：H1 商品 PUT/DELETE 归属校验（IDOR 越权写）、H2 子账号权限绕过（`require_merchant` 复用请求会话、缺失/禁用直接 403）、H3 发票 PDF 越权读（归属校验，404 兜底）。
- **中危（已修）**：M1 支付确认端点仅 sandbox 可用（生产 404）；M2 退款金额夹紧 `[0, 实付]`；M3 优惠券并发行锁防 double-spend；M4 状态流转锁顺序排序防死锁；M5 N+1 批量预取；M6 列表分页（上限 500）；M7 WebSocket 用户 `is_active` 校验；M8 评价删除归属校验；M10 前端 Banner 外链协议校验 + `noopener`；M13 积分下限 + 买方行锁。
- **经验证无需改动**：M9（库存归属已在 service 校验）、M11（refresh 同时支持 Cookie / Body，两种前端实现均可用）、M12（工单列表按 `user.id` 服务端隔离）。
- **后续优化（已落地，详见报告 §6.3）**：L1 调度器逐单 rollback；L2 `checkout` 拆为 `_build_order_items` / `_apply_promotions_and_discounts` / `_compute_freight` 三子函数；L3 前端 `any` 收敛（`ApiError` / `getErrorMessage` / 全站 `AxiosError<ApiError>`）；L4 抽取共享 `ProductCard` / `ProductGrid`；L5 静默 catch 改显式错误提示；L6 `Guard.tsx` 委托 `ProtectedRoute`；L7 DB 权威时钟 `_db_now`；M4 状态变更 + 审计同事务原子提交与回滚。
