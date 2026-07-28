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
