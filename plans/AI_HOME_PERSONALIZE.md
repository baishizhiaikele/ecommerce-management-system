# AI 首页个性化改造方案（D 全做）

> 目标：把现有「身份/时段楼层排序查表 + LLM 仅写文案」升级为「真实用户画像驱动 + LLM 参与决策 + 个性化商品召回」的闭环。

## 现状盘点（已确认）

- 用户真实画像数据齐全：`role`(buyer/merchant/admin)、`level`(bronze/silver/gold)、`points`、`growth_value`、`created_at`，以及 `orders`/`favorites` 关系。
- `recommendation_service.recommend_for(user_id)` **已是一个成熟的真实个性化召回引擎**：浏览(ProductView)/收藏(Favorite)/购买(OrderItem) 三路信号 → 类目打分 → 单条 SQL 热销召回 → 冷启动兜底。前端「猜你喜欢」已在用。
- 真正的水份在 `home-arrange`：
  1. `segment` 是**前端手动选的假身份**（`Segmented` 下拉框 buyer/new/returning/member），与真实用户脱节。
  2. LLM 只生成一句解释文案，不参与任何决策。
  3. 楼层顺序与「推什么商品」完全割裂（编排只排顺序，召回另算）。

## 改造范围（A+B+C 全做，复用已有好代码）

### A. 真实身份识别（不再前端假选）
- 新增 `app/services/profile_service.py`：`infer_segment(db, user) -> str`
  - 依据：`role==MERCHANT/ADMIN` → 不面向买家首页（返回 `"merchant"` 供前端区分）；
  - `buyer` 时按行为判分：`order_count==0 && created_at 在 7 天内` → `new`；`level in (silver,gold) || points>=500` → `member`；否则 `returning`。
- 改动 `GET /ai/home-arrange`：去掉前端 `segment` 入参（保留可选 `segment` 仅作调试/演示 override），改为从 `get_current_user` 推导真实 `segment`；`hour` 缺省取服务端真实时间。

### B. 编排真正驱动个性化召回
- 扩展 `HomeArrangeOut`：每个 `FloorOut` 增加可选的 `products?: ProductOut[]`（楼层实际内容）。
- 在 `arrange_home` 中，对个性化楼层（`recommend`/`recent`/`flash`/`top_sales`/`top_rating`/`shops`）调用对应取数：
  - `recommend`：`recommendation_service.recommend_for(db, user_id, limit=6)`
  - `recent`：`ProductView` 最近 N 条（去重）
  - `top_sales`/`top_rating`：`list_products(sort=sales|rating)`
  - `flash`：取 `discount_price` 非空且 `status==ACTIVE` 的商品
  - `shops`：按卖家聚合（取有在售商品的店铺前 N）
- 冷启动（无行为的新客）仍走热销兜底，保证不空。

### C. LLM 参与决策（而非仅写文案）
- 新增 `AIService.decide_home_layout(profile, candidates) -> dict`：
  - 输入：用户画像(JSON) + 各楼层候选商品摘要 + 当前时段。
  - 输出（结构化 JSON，带 mock 兜底）：`{ "floor_order": [...key...], "focus_floor": "recommend", "rationale": "..." }`
  - 用 LLM 返回的 `floor_order` 覆盖默认 `_SEGMENT_PRIORITY` 排序；`rationale` 作为 `insight`。
  - 无 `AI_API_KEY` 时：保持现有确定性排序逻辑（向后兼容），`insight` 走原 mock 模板。
- 安全：LLM 只决定**顺序与一个强调楼层**，不直接指定具体商品，避免幻觉引入不存在的商品。

## 前端改动（AIMall.tsx）
- 移除 `Segmented` 假身份选择器；调用 `homeArrange()` 不带 `segment`（后端自动识别）。
- 若 `floor.products` 存在，直接在对应楼层区块内渲染商品卡片网格（复用现有 `ProductCard`/卡片样式）。
- 保留「演示/调试」入口：可选 `?segment=` 仍可用（仅调试），但默认隐藏。

## 数据安全与边界
- 所有推荐/编排接口保留 `get_current_user` 鉴权；`home-arrange` 改为需登录（原实现是匿名的，需补依赖）。
- LLM 调用统一走 `ai_service` 的 `_chat` + 超时 + mock 兜底，不阻塞主流程。

## 验证
1. 新客登录 → `home-arrange` 返回 `segment=new`，`recommend` 楼层走热销兜底有内容。
2. 老客（有浏览/收藏/订单）登录 → `recommend` 楼层返回个性化商品（类目命中历史行为）。
3. 配置 `AI_API_KEY` 时 `insight` 为 LLM 生成且 `floor_order` 生效；无 key 时降级不报错。
4. 前端不再出现假身份下拉；楼层内可见真实商品卡片。
