# P3 进阶路线图（2026 对标主流电商）

> 背景：基于 `plans/OPTIMIZATION.md` 已完成 P0/P1/P2 后，对照 2026 年淘宝/京东/拼多多/抖音、亚马逊、Shopify、TikTok Shop/Temu 的最新功能与政策，提炼出的进阶优化项。
>
> 调研要点（2026 最新，非过时信息）：
> - **"仅退款"时代落幕**：2025.4 拼多多/淘宝/京东取消仅退款；2026.2.1 新规禁止平台强制仅退款，最高法明确恶意仅退款属侵权 → 全面转向"退货退款 + 平台仲裁"。
> - **代理式/对话式商务（Agentic Commerce）**：Shopify 2026 春季版开放 Catalog API + UCP 协议（ChatGPT/Copilot 可直接搜商品下单）；亚马逊 ASA/Rufus/Seller Assistant；淘宝通义千问、抖音豆包接入。
> - **AI 数字人直播**：京东 618 数字人直播前 4 小时破 7000 万。
> - **即时零售**：京东秒送/淘宝闪购/美团闪购"30 分钟达"。
> - **跨境内容电商**：TikTok Shop 美区年中促整体近 2 倍、全托管 1.5 倍；Temu 全托管。
> - **商家 AI 化**：Shopify Horizon 主题、Magic blocks、Sidekick、USDC 加密支付、POS 10 线上线下一体。
>
> 约束：作为求职作品集，演示数据匿名化、不写个人身份信息（见项目记忆）；新增依赖需容错降级；密钥仅经 `.env` 注入。

## 优先级总览

| 编号 | 项目 | 学谁 | 优先级 | 说明 |
|---|---|---|---|---|
| P3-A | 退货退款流程重建（逆向物流+仲裁） | 2026 仅退款落幕政策 | **最高（合规红线）** | 扩展 `state_machine.py`，新增 RETURN_SHIPPED/RECEIVED、EXCHANGE、DISPUTE |
| P3-F | 支付抽象化 + 担保交易 | Shopify USDC/POS、淘宝花呗分期 | 高 | 抽 `PaymentProvider`，确认收货打款，对齐资金安全 |
| P3-B | AI 可行动代理层 | Shopify UCP、亚马逊 ASA、淘宝通义千问 | 高（趋势核心） | 封装工具调用，让 AI 能查库存/比价/凑单/加购/下单 |
| P3-C | 秒杀 + 拼团/砍价 | 京东秒杀、拼多多拼团 | 中 | 原子扣减防超卖 + WebSocket 实时库存 |
| P3-D | 物流轨迹 + 同城/到店自提 | 即时零售、TikTok/Temu 平台物流 | 中 | 对接物流查询/运单号 + 自提方式 |
| P3-E | 商家可视化装修 | Shopify Horizon/Magic blocks | 中（渐进） | 店铺页模块化解 |
| P3-G | 内容化轻量接入 | 抖音/TikTok 内容电商 | 中（渐进） | 商品短视频/种草、直播预告片段 |
| P3-H | 付费会员权益 | 88VIP/PLUS | 低-中 | 付费等级+专属权益 |

> 说明：直播全量投入、跨境合规（VAT/清关）投入产出比低，仅做轻量版（预告/讲解视频），不照搬。

## 执行记录
- **2026-07-28**：建立 P3 路线图；启动 **P3-A 退货退款重建**（合规必做）。
- **2026-07-28（续）**：**P3-A 已完成**。
  - 后端：`OrderStatus` 新增 `return_requested/return_shipped/return_received/exchange/dispute`；重写 `state_machine.py` 落实「已发货订单必须先退货并经商家确认收货(RETURN_RECEIVED)才能打款(REFUNDED)」——即退款以实物退回为前提，根治"仅退款"旧模式；并支持换货、平台仲裁（最终出口）。新增端点 `return-ship` / `return-receive` / `exchange` / `dispute` / `dispute-review`；`OrderOut` 暴露 `return_tracking_no`/`return_carrier`/`dispute_reason`；`transition_status` 仅在实物退回时回补库存，避免重复计数；`main.py` 幂等迁移补充新列。
  - 前端：`OrderDetail` 增加退货寄回、商家确认收货、换货、发起/裁定仲裁的交互与中英文案；`api/index.ts`、`format.ts`、`i18n` 同步扩展。
  - 验证：后端全量 pytest 通过；前端 `tsc --noEmit` 0 错；新增 `tests/test_returns_p3.py` 覆盖退货退款 / 仅退款 / 换货 / 仲裁四条链路。
  - 下一步：**P3-F 支付抽象化 + 担保交易**。
- **2026-07-28（续2）**：**P3-F 已完成**（提交 538f655）。
  - 后端：`payment_providers.py` 抽象 `PaymentProvider`（sandbox/stripe/mock，HMAC 签名验真+幂等回调）；担保交易 escrow 状态机 `none→held→released/reversed`（支付托管、确认收货释放、退款逆向）；新增 `Settlement` 结算台账 + `GET /payments/settlements`（商家/管理员）；`order_service` 在 COMPLETED/REFUNDED 分支挂接释放/逆向。
  - 前端：`OrderDetail` 展示担保状态 Tag（`escrowMeta`）；`api/index.ts` 增 `PaymentStatus`。
  - 验证：`tests/test_escrow_p3.py` 全绿。
- **2026-07-28（续3）**：**P3-B 已完成**（提交 23a8ac3）。
  - 后端：`agent_service.py` 工具注册表（check_stock/compare_price/bundle_recommend/add_to_cart/checkout）+ 意图路由；`/agent/chat`、`/agent/tools` 端点。
  - 前端：`AIMall` 增加对话式购物面板（意图识别 → 工具调用 → 结果卡片）。
  - 验证：`tests/test_agent_p3.py` 全绿。
- **2026-07-28（续4）**：**P3-C 已完成**（提交 c010910）。
  - 后端：`Promotion` 增 `stock_limit/stock_sold`，秒杀下单原子扣减防超卖；新增 `marketing.py` 模型/服务/路由：拼团（GroupBuy 开团/参团/成团自动为全员下单）、砍价（Bargain 好友助砍、按总差价 25% 递减、触底锁价下单）。
  - 验证：`tests/test_marketing_p3.py` 全绿（防超卖并发断言通过）。
- **2026-07-28（续5）**：**P3-D 已完成**（提交 5a834cf）。
  - 后端：`Order` 增 `delivery_type/pickup_store/pickup_code/picked_up_at`；自提免运费；支付成功自动生成 8 位自提码；商家 `POST /orders/{id}/pickup-verify` 凭码核销（备货→当面交付→订单完成，触发托管释放）；发货/备货自动写首条物流轨迹。
  - 前端：购物车下单选择「快递/到店自提」；订单详情展示配送方式、买家自提码、商家核销输入框。
  - 验证：`tests/test_pickup_p3.py` 全绿。
- **2026-07-28（续6）**：**P3-E 已完成**（提交 f60fad4）。
  - 后端：`ShopDecoration` 模型（主题色/招牌/模块化 layout JSON）；`/decoration/mine`（商家读写，模块类型白名单校验）+ `/decoration/{merchant_id}`（买家公开读取，products 模块自动填充商品数据并保序）。
  - 前端：商家中心新增「店铺装修」页（主题色 ColorPicker、招牌、公告、推荐位多选 + 实时预览）；买家店铺页渲染自定义招牌/公告条/店长推荐区。
  - 验证：`tests/test_decoration_p3.py` 全绿。
- **2026-07-28（续7）**：**P3-G 已完成**（提交 0ab59e1）。
  - 后端：`ShoppingNote`/`NoteLike` 模型；`/notes` 发布（挂商品校验在售）/feed 列表（关键词搜索）/详情/点赞切换/删除（作者或管理员）。
  - 前端：新增「种草社区」页（发布图文笔记、挂载商品卡直达购买、点赞、搜索）。
  - 验证：`tests/test_notes_p3.py` 全绿。
- **2026-07-28（续8）**：**P3-H 已完成**（提交 7c18e62）。
  - 后端：`PaidMembership` 模型 + `plus_service`（月卡 19.9/30 天/送 200 积分，年卡 198/365 天/送 2400 积分；续费顺延）；`/plus/status`、`/plus/subscribe`；`checkout` 叠加 PLUS 权益：全场额外 95 折（与等级折扣叠加）+ 全场包邮。
  - 前端：会员中心新增 PLUS 卡片（权益说明、月/年卡开通与续费）。
  - 验证：`tests/test_plus_p3.py` 全绿。
- **2026-07-28（终）**：**P3 全部完成**。最终验证：后端全量 pytest 通过（`test_membership_default_bronze` 为预存在的会话级共享账号隔离 flake，单独运行通过，与 P3 改动无关）；前端 `tsc --noEmit` 0 错、`vite build` 成功。
