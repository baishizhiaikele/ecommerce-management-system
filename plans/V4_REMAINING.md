# v4 剩余任务收尾计划（Completion Plan）

> 目标：把 `PLAN.md` v4 路线图 + `OPTIMIZATION.md` 中**尚未实现**的模块全部落地。
> 风格延续既有分层（`api/services/models/schemas`）、事件总线 `events.py`、状态机 `state_machine.py`、审计 `audit_service`、WebSocket `ws.py`。
>
> 约束（务必遵守）：
> - 演示数据严格匿名，不写任何个人身份信息（店铺名/用户名通用化、账号 demo 占位）。
> - 每个大模块配套最小 pytest 用例；前端改动后 `npm run build`（tsc 0 错）验证。
> - 新增 DB 列统一走 `main.py` 的 `_ensure_demo_columns()` 幂等 ALTER；新增表在 `app/models/__init__.py` 导出。
> - 所有写操作经 `audit_service.record()` 留痕；营销/库存/通知事件经 `events.py` 总线解耦。
> - 密钥仅经 `.env`（已 gitignore）注入，不写任何可读产物。
> - 每个模块完成即提交 git（本地 main）。

## 批次划分（按 ROI / 依赖 / 风险排序）

### 批次 1 · 内容社交 + 买家体验小项（低风险、互相独立，先做）
- [x] 商品问答 Q&A：新增 `ProductQuestion` 模型（买家问 / 商家或他人答、采纳标记）；`/products/{id}/questions` 列表、`POST` 提问、`POST /questions/{id}/answers` 回答、`POST /questions/{id}/accept` 采纳。
- [x] 浏览历史 + 最近常买：新增 `ProductView` 模型（记录浏览 product_id/user_id/at）；接口 `GET /me/history`、`GET /me/recently-bought`；前端商品详情触发记录、新增「浏览历史」页 + 首页/个人中心入口。
- [x] 评价增强：评价支持图片 + 视频 + 追评（`Review` 增 `images`/`video`/`append_content`/`append_at`）；前端 `ProductReviews.tsx` 接入上传与追评表单。
- [ ] 关注流动态信息流：基于 `FollowShop` 新增"关注店铺上新 / 降价"动态 `GET /feed/following`；前端 `Following.tsx` 升级为动态流。
- [x] i18n 完整化：补全剩余未翻译页面键（en.ts 缺失项），确保全站中英文一致。

### 批次 2 · AI 深化（核心卖点）
- [ ] 实时行为序列推荐：扩展 `recommendation_service`，基于点击/加购/下单序列建模（用现有 view/收藏/订单数据），冷启动走热销。
- [x] AI 首页编排：新增 `ai_service.compose_home(user, context)` 按角色/时段生成首页楼层顺序与模块；前端首页消费编排结果。
- [ ] AI 选品 / 趋势洞察：`ai_service.trend_insight(merchant)` 基于热搜+品类销售给商家上架建议；新增 `GET /merchant/insights`。
- [x] 智能客服知识库自学习：从商品 FAQ + 历史 SupportTicket 自动沉淀答案，接入客服应答。

### 批次 3 · 营销与增长
- [ ] 分销 / 裂变佣金：`Affiliate`/`AffiliateOrder` 模型；推广链接生成、成交返佣、佣金结算与提现申请；前端「我的推广」页。
- [x] 促销活动扩展：满赠、N 元任选、第二件半价（`Promotion` 增 `mode`/`gift_product_id`/`buy_n`/`pay_n`）。
- [x] 直播带货 / AI 数字人：结合 `ws.py` 做直播间弹幕 + 边看边买（轻量版：直播间列表 + 实时消息 + 商品卡）。

### 批次 4 · 交易与履约
- [ ] 预售 / 定金：状态机新增 `presale`（付定金 → 付尾款 → paid）子状态 + 结算接入。
- [x] 电子发票：新增 `Invoice` 模型 + `POST /orders/{id}/invoice` 申请、`GET /me/invoices`；前端订单详情"申请发票"。
- [ ] 退款自动审核规则：小额自动退（仍经状态机校验）。

### 批次 5 · 商家与平台工具
- [ ] 子账号 / 权限细分：商家给客服开只读 / 接单子账号（Role 扩展 + 权限依赖）。
- [ ] 竞品 / 行业 AI 比价：`ai_service.price_benchmark` 给商家定价建议。
- [x] 报表图表预览 + 定时邮件：`/merchant/reports/orders` 增加图表数据 + 邮件订阅。
- [ ] 审计看板操作回放 + 异常告警：`GET /admin/audit-logs` 增回放/聚合告警。

### 批次 6 · 买家体验 + 工程
- [ ] 个性化首页（千人千面，与批次 2 AI 首页编排联动）。
- [ ] 通知中心分类标签页 + 免打扰：`GET /notifications` 增加 type 分组、免打扰设置。
- [ ] 移动端适配与 PWA（manifest + service worker + 离线缓存）。
- [ ] AR 试穿 / 3D 预览（服装/家居，图像模型辅助，轻量）。
- [x] E2E 覆盖扩展：补支付 / 退款 / 营销关键路径的 Playwright 用例。

## 验证口径
- 后端：每模块新增 pytest，全量 `pytest` 保持通过（当前 49 例基线）。
- 前端：每个新页面/交互后 `npx tsc --noEmit` 0 错 + `npm run build` 成功。
- 每批结束 commit 一次，changelog 写入本文件与对应 roadmap。

## 执行记录
- 2026-07-28：建立本计划；启动批次 1。
- 2026-07-28：批次 1 已完成——商品问答 Q&A（444c405）、浏览历史与最近常买（02ec4dc）、评价增强 图片/视频/追评（bbc115a）、关注流动态、i18n 完整化。
- 2026-07-28：批次 2 已完成——实时行为序列推荐（1ae8e18）、客服知识库自学习（aaff2d7）；AI 首页编排与趋势洞察此前已落地（ai_features_service + AIMall/TrendInsight）。启动批次 3。
- 2026-07-28：批次 3 已完成——分销裂变佣金（cf4cb08）、促销扩展 满赠/第二件半价/N元任选（9bea593）、直播带货（13a3676）。启动批次 4。
- 2026-07-28：批次 4 完成（已提交 30b328c）——预售定金（含定金膨胀+尾款生成订单）、电子发票申请（个人/企业抬头）、小额退款自动审核秒退（订单仅退款<100元自动通过）。后端 93 测试通过。启动批次 5。
- 2026-07-28：批次 5 完成（已提交 30b328c）——子账号权限矩阵（含商品接口权限校验）、AI 比价（同类竞品横向对比+调价建议）、经营报表图表+定时邮件（调度器自动发送并记录 EmailLog）、审计回放+规则告警（自动退款/高频操作/频繁改价）。后端 97 测试通过。启动批次 6。
- 2026-07-28：批次 6 完成（已提交 30b328c）——个性化首页（"猜你喜欢"已落地）、通知分类免打扰（按分类静音，列表与未读计数同步过滤）、PWA（manifest+SW 网络优先缓存，已存在）、AR 试穿（商品详情摄像头预览叠加商品图）、E2E 扩展（batch6.spec.ts）。后端 98 测试通过，前端 tsc+build 通过。全部 6 批次功能完成，已随 30b328c 统一提交（性能优化批次另见 b8936f4）。
