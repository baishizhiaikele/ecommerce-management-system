# AI 全托管小店 · 功能拓展路线图（v2）

> 目标：在现有全栈电商（FastAPI + React + 三角色 + 订单状态机 + AI 降级）基础上，分 5 阶段新增 18 个功能模块。
> 原则：复用现有分层（api/services/models/schemas）、事件总线 `events.py`、状态机 `state_machine.py`、审计 `audit_service`；演示数据不写任何个人身份信息。

---

## 阶段总览

| 阶段 | 主题 | 模块 |
|------|------|------|
| P1 | 基础设施与横切能力 | 图片上传、搜索增强、积分/会员、优惠券、收藏、通知（模型+事件） |
| P2 | 买家侧体验 | 收藏页、通知中心、优惠券结算抵扣、积分成长中心 |
| P3 | AI 差异化亮点 | 个性化推荐「猜你喜欢」、AI 营销文案、AI 智能定价、客服意图识别转人工 |
| P4 | 商家侧经营 | 多商家店铺页、经营报表 CSV 导出、客服转人工工单台 |
| P5 | 售后与平台治理 | 退款售后工单、物流追踪、审计可视化看板、i18n 中英文 |

---

## P1 · 基础设施与横切能力

### 1. 图片上传（基础设施）
- 后端：`POST /upload/image`（接收 multipart，存本地 `backend/uploads/` 或对象存储，返回 URL 写入 `Product.image_url` / `Review` 图片）。
- 前端：商品管理、评价表单接入上传组件；`.gitignore` 忽略 `uploads/`（保留 `.gitkeep`）。
- 限制：类型/大小校验，防目录穿越。

### 2. 搜索增强
- 商品列表 `GET /products` 增加：`sort`（销量/价格/最新）、`min_price/max_price`、`in_stock`、多关键词分词匹配。
- 复用现有 SQLAlchemy，避免全表扫描（已分页）。

### 3. 积分 / 会员体系
- 模型：`points` 字段（User）、`PointLog` 流水表；下单完成 +积分、退单 -积分。
- 等级：按累计积分映射 VIP 等级，享受等级折扣（结算时叠加优惠券前计算）。
- 事件总线：订阅 `order_completed` / `order_refunded` 自动记账。

### 4. 优惠券 / 促销
- 模型：`Coupon`（满减/折扣/新人券）、`UserCoupon`（领取记录）。
- 接口：领券 `POST /coupons/{id}/claim`、我的券 `GET /coupons/mine`；结算 `checkout` 入参 `coupon_code`，service 内校验门槛并计算。
- 事件：新人注册自动发券。

### 5. 收藏 / 心愿单
- 模型：`Favorite(user_id, product_id)`，唯一约束。
- 接口：`POST/DELETE /favorites`、`GET /favorites`。

### 6. 站内信 / 通知中心
- 模型：`Notification(user_id, type, title, content, is_read, ref_id)`。
- 事件总线订阅：订单状态变更、差评预警、优惠券到账、积分变动 → 自动写通知。
- 接口：`GET /notifications`、`PATCH /notifications/{id}/read`、`POST /notifications/read-all`。

---

## P2 · 买家侧体验（前端为主）

- **收藏页** `pages/buyer/Favorites.tsx`：栅格卡片，一键移入购物车。
- **通知中心** `pages/buyer/Notifications.tsx`：列表 + 标记已读 + 红点角标（接 Zustand）。
- **结算抵扣**：`Checkout.tsx` 增加优惠券选择、积分抵扣开关，实时显示应付。
- **积分成长中心** `pages/buyer/Points.tsx`：等级进度条 + 积分流水。

---

## P3 · AI 差异化亮点

### 7. 个性化推荐「猜你喜欢」
- 后端：`GET /recommendations`（基于浏览/加购/购买行为或类目相似度，无行为时返回热销）。
- 前端：首页信息流模块，卡片带「为你推荐」标。

### 8. AI 营销文案生成
- 后端：`POST /products/{id}/ai-marketing`（入参平台：小红书/朋友圈/抖音）→ 返回风格化文案。复用 `ai_service`。
- 前端：商家商品管理页「一键生成推广文案」面板，可复制。

### 9. AI 智能定价建议
- 后端：扩展 `ai_service.generate_product_copy` 返回更细的 `price_suggestion` + 调价理由；`GET /products/{id}/ai-price-advice`。
- 前端：商品编辑页展示建议价与理由，一键应用。

### 10. 客服意图识别 + 转人工
- 后端：`ai_service` 增加意图置信度；低置信/特定意图返回「建议转人工」标记；`POST /support/tickets` 建工单，`GET /merchant/support/tickets` 商家处理。
- 前端：AI 客服浮窗增加「转人工」入口与工单状态提示。

---

## P4 · 商家侧经营

### 11. 多商家店铺页（Marketplace）
- 后端：`GET /shops/{merchant_id}`（店铺信息 + 该商家 active 商品）；商品页展示商家名/评分。
- 前端：`pages/shop/Shop.tsx` 店铺首页。

### 12. 经营报表导出
- 后端：`GET /merchant/reports/orders?format=csv` 流式返回 CSV（销售额、订单量、热销）。
- 前端：商家仪表板「导出报表」按钮。

### 13. 客服转人工工单台
- 后端：见 P3-10 的 tickets 接口（商家侧列表/回复/关闭）。
- 前端：`pages/merchant/SupportTickets.tsx`。

---

## P5 · 售后与平台治理

### 14. 退款售后工单
- 状态机扩展：`PENDING_PAYMENT → PAID → SHIPPED → COMPLETED`，退货款：`PAID/SHIPPED → REFUND_REQUESTED → REFUNDED`（已预留）；新增 `REFUND_REJECTED`。
- 后端：`POST /orders/{id}/refund`（理由+图片）、`PATCH /orders/{id}/refund-review`（商家/admin 审核）。
- 前端：订单详情「申请退款」、商家/管理员退款审核队列。

### 15. 物流追踪
- 后端：`POST /orders/{id}/logistics`（录入运单号/轨迹）或对接快递 API mock；`GET /orders/{id}/logistics` 返回时间线。
- 前端：订单详情物流时间线组件。

### 16. 审计可视化看板
- 后端：扩展 `GET /admin/audit-logs` 增加按动作/时间聚合。
- 前端：`pages/admin/AuditDashboard.tsx` 折线/环形图（recharts）。

### 17. i18n 国际化
- 前端：接入 i18next，抽取文案，中/英切换（顶栏开关）。
- 后端：错误文案可选随 `Accept-Language` 返回（轻量）。

---

## 收尾（tests-deploy）
- pytest 补充：优惠券计算、积分记账、退款状态机、推荐非空。
- Playwright e2e：领券→结算抵扣、收藏→加购、退款申请→审核。
- 更新 `README.md` / `GETTING_STARTED.md`（新接口、新演示数据）；`render.yaml` 如需新增环境变量则补充。
- 提交 git（main 分支，你确认后执行）。

---

## 实施顺序（todolist）
1. `foundation-models`：P1 全部模型 + 事件订阅
2. `buyer-features`：P2 后端接口 + 前端买家中心
3. `ai-extensions`：P3 AI 扩展 + 推荐 + 前端营销/推荐
4. `trade-deepening`：P4/P5 售后/物流/店铺 + 前端
5. `admin-data`：P5 报表/审计/i18n + 前端
6. `tests-deploy`：测试 + 文档 + 部署校验
