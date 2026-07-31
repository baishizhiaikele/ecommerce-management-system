# 综合修改方案（代码错误 / 功能 Bug / UX 人性化）

> 范围：全量（后端 290+ 文件 + 前端 110+ 文件）
> 优先级取向：**先修阻断性错误、资金与越权类严重 bug，再修系统性 UX 缺陷**（由我定夺）
> UX 风格：**保持现有简约精选风**（大留白、统一栅格、柔和阴影），不转国内活动流；重点修"错误态伪装成空态""移动端缺搜索""信息架构未取舍"等。
> 制定日期：2026-07-31

---

## 一、总体结论

- **架构基础是健全的**：FastAPI + SQLAlchemy 2.0(异步) + Pydantic V2；React 18 + TS + Vite + AntD + Tailwind + Zustand；44 个 router 全部正确挂载、无循环 import、能正常启动；鉴权（JWT 双令牌+HttpOnly Cookie）与 i18n 基建扎实。项目"广度"极大（56+ 页面，含退换货/纠纷/分销/直播等复杂链路）。
- **核心矛盾**：广度远超打磨深度。三大类问题最突出：
  1. **数据库 schema 演进机制断裂**——Alembic 迁移、`create_all` 兜底、`_DEMO_COLUMN_DEFS` 手工补列三套互不感知的建表路径并存，缝隙处即线上 500。
  2. **被 `except` 静默吞掉的"致命功能失效"**——若干接口看似实现、测试绿灯，实际永不执行或静默崩溃（积分发放、定时报表、PDF 导出、推荐兜底）。
  3. **系统性 UX 缺陷**——全站 ~30 处 `.catch(()=>{})` 把"网络/服务错误"伪装成"数据为空"；移动端无搜索入口；导航未做减法；价格/优惠不透明；表单校验缺失。
- 下面按 **Tier 1（阻断/致命）→ Tier 2（资金/权限/严重逻辑）→ Tier 3（UX 人性化）** 给出可落地的修复清单。每条标注 `文件:行号 + 问题 + 修复方向 + 严重级别`。

---

## 二、Tier 1 — 阻断级 / 致命（最先修，否则核心功能不可用）

### 1.1 数据库 schema 演进断裂导致下单 100% 500（致命）
- **现象**：`POST /api/orders/checkout` 报错 `table order_items has no column named variant_id`。
- **根因**（三处叠加，`backend/app/main.py` + `backend/migrations/`）：
  1. `migrations/versions/0001_initial.py` 中 `if inspector.has_table("users"): return` —— 老库直接跳过整段初始建表。
  2. 后续 9 个迁移**没有任何一个**添加 `order_items.variant_id` / `cart_items.variant_id`（`migrations/` 下 grep `variant_id` 命中 0）。
  3. `main.py:212` 的 `Base.metadata.create_all()` 只建"缺失的整张表"，**不补已存在表缺失的列**；而 `_ensure_demo_columns()`（`main.py:142-170`）把补列失败静默 `logger.warning` 吞掉，启动日志看起来正常，直到用户下单才炸。
- **修复方向**：
  - 立即止血：对老库执行 `ALTER TABLE order_items ADD COLUMN variant_id VARCHAR(36)` 与 `cart_items` 同名列（开发库可直接跑 `_ensure_demo_columns` 逻辑，但要把"表不存在导致的失败"与"列已存在"区分开）。
  - 根因修复：为 `variant_id` 补**真正的 Alembic 迁移**版本文件；将 `_ensure_demo_columns` 的 `except`（`main.py:167`）改为"非『列已存在』错误则抛错"，让问题在启动期暴露而非潜伏。
  - 中期：用 `alembic revision --autogenerate` 补齐缺失的约 80 张表迁移，废弃 `_DEMO_COLUMN_DEFS` 这套影子机制（与项目 PLAN.md「数据库变更必须新增 Alembic 迁移」约束对齐）。

### 1.2 `merchant.py` PDF 导出接口 100% 报错（致命）
- **`backend/app/api/merchant.py:73`**：`raise HTTPException(...)` 但文件头**未 import `HTTPException`**（只 import 了 `APIRouter, Depends, Query, status`），触发 `NameError` → 500。
- **`backend/app/api/merchant.py:78`**：`Order.merchant_id` —— `Order` 模型**无该字段**（商家归属须经 `OrderItem→Product.merchant_id`，而同文件 CSV 导出 `:26-31` 写法正确，二者自相矛盾）。
- **修复方向**：补 `from fastapi import HTTPException`；把 `Order.merchant_id == ...` 改为经 `OrderItem.join(Product)` 按 `Product.merchant_id == merchant.id` 关联查询（参照上方 CSV 导出写法）。

### 1.3 订单完成/退款的积分发放静默崩溃（致命）
- **`backend/app/events_handlers.py:55`**：`add_points(s, buyer_id, "order_complete", ...)` 传**裸字符串**，但 `PointLog.action` 是 `SAEnum(PointAction)`，非枚举实例写入会抛 `LookupError/StatementError`。
- **`backend/app/events_handlers.py:88`**：同理传 `"refund"`。
- **影响**：异常被 `events.py` 的 `except Exception` 吞掉 → 订单完成后**买家拿不到积分、成长值不更新、分销佣金不结算**（handler 整段中断）。
- **修复方向**：两个调用改为 `PointAction.ORDER_COMPLETE` / `PointAction.REFUND`（参照 `plus_service.py`、`order_service.py` 中的正确写法）。

### 1.4 定时报表任务永远抛异常，功能形同虚设（致命）
- **`backend/app/core/scheduler.py:71`** 调 `report_task_service.send_due_reports()` 缺必填 `db` 参数（定义见 `backend/app/services/report_task_service.py:81`），`TypeError` 被 `except Exception` 静默吞掉 → **定时报表邮件从未真正发送**（测试因直接传 db 调用而绿灯）。
- **修复方向**：调度器内 `async with SessionLocal() as db: await send_due_reports(db)`。

### 1.5 推荐兜底查询传入 Python `set` 导致冷启动空推荐（致命）
- **`backend/app/services/recommendation_service.py:134`**：`Product.id.notin_(seen)` 中 `seen` 是 `set[str]`，SQLAlchemy 对 `set` 支持不稳；且 `seen` 为空集时 `NOT IN ()` 在部分方言渲染成恒假 → **冷启动用户（无任何行为）拿到空推荐列表**。
- **修复方向**：`seen` 转 `list`；空集时跳过该 `notin_` 条件（参照同文件 `:111-112` 用 `Select` 子查询的写法）。

### 1.6 前端 `Cart.tsx` 编译错误 → `npm run build` 失败（阻断）
- 实测 TS 错误：`Cart.tsx` 处 `getErrorMessage` 调用与 `c.threshold`（Decimal=string）参与数值比较/算术报错。
- **根因**：**两个同名不同签名的 `getErrorMessage`**（`frontend/src/api/index.ts:35` 单参数 vs `frontend/src/api/client.ts:18` 双参数），`Cart` 从 `../api` 导入却按 client 签名使用。
- **修复方向**：收敛为**单一实现**（保留 `client.ts` 的双参数版，或在 `api/index.ts` 统一导出）；金额相关字段统一 `Number()` 包裹。

### 1.7 商品详情/AI 商城"相关推荐"静默失效（严重，核心转化模块）
- **`frontend/src/pages/ProductDetail.tsx:217`**：`listProducts(...).then((r) => r.items.filter(...))` —— `r` 是 `ProductOut[]`，**没有 `.items`** → `TypeError` 被空 `catch` 吞掉 → 用户永远看不到"猜你喜欢"。
- **`frontend/src/pages/AIMall.tsx:161-173`**：同样问题，用 `as any` + `?? []` 兜底成空数组。
- **修复方向**：按 `api/index.ts:404` 的真实返回类型改为 `r.filter(...)`（或 `r.data ?? r`）。

---

## 三、Tier 2 — 资金 / 权限 / 严重逻辑（必须修，存在资损与越权风险）

### 3.1 退款无状态校验、可重复退款、金额取全额（严重，资金安全）
- **`backend/app/services/payment_service.py:141-158`**：`refund_payment()` 未校验 `payment.status`（未支付的订单也能退款，凭空建 payment 标 `refunded`；已 `refunded` 可重复退）。
- **`backend/app/services/payment_service.py:144`**：`build_refund(payment, float(payment.amount))` 硬编码退**全额**，无视 `order.refund_amount` → 买家申请退 10 元（订单 100 元）实际退 100 元。
- **修复方向**：进入退款先校验 `payment.status == "paid"` 且未退过；金额用 `float(order.refund_amount or payment.amount)`，与 `orders.py:179` 的夹紧逻辑一致。

### 3.2 多商家混合订单货款结算给"第一个商家"（严重，资金错付）
- **`backend/app/services/payment_service.py:205-212`**：`release_escrow` 的 `_order_merchant_id()` 只取 `items[0]` 的商家，而 `checkout` 支持多商家分账 → 其他商家永远收不到钱。
- **修复方向**：按 `OrderItem→Product.merchant_id` 逐商家分账结算（与 `merchant_subtotals` 分组口径一致）。

### 3.3 退款状态机可无限循环（严重，薅羊毛入口）
- **`backend/app/state_machine.py:31-34`**：`REFUND_REQUESTED↔REFUND_REJECTED` 无限往返，无重试上限。
- **修复方向**：加入"商家驳回次数上限"或"买家重提次数上限"，超过转人工/仲裁。

### 3.4 积分抵扣可超额、且叠加后 discount 可超 subtotal（严重，用户资产损失）
- **`backend/app/services/order_service.py:179-183`**：`points_used = min(buyer.points, int(subtotal*100))` 按**未打折的 subtotal** 算上限，但优惠券/会员/PLUS 折扣已累加进 `discount`，导致 `discount` 远超 `subtotal`、积分被实际扣光却没等值抵扣。
- **修复方向**：积分抵扣上限改为"扣完其他折扣后**剩余应付**"对应的积分数（`(subtotal - 已累计discount)` 换算），并对 `discount` 做 `min(discount, subtotal)` 总夹紧。

### 3.5 领券库存扣减无行锁，限量券可被超发（严重，薅羊毛）
- **`backend/app/services/coupon_service.py:82,91`**：读 `coupon.issued >= coupon.total` 与 `issued += 1` 之间无行锁。
- **修复方向**：领券时对 `Coupon` 行 `with_for_update()`（参照 `order_service.py:51` 对买家行的锁法）。

### 3.6 优惠券过期字段被完全忽略（严重，过期机制形同虚设）
- **`backend/app/services/coupon_service.py:55-66`**：`_in_valid_window` 只查 `start_at/end_at`，**不查 `expire_at`** → 若 `end_at=None, expire_at=某日期` 则券永久有效。
- **修复方向**：`_in_valid_window` 增加 `expire_at` 判断（与 `UserCouponOut` 展示口径一致）。

### 3.7 支付接口硬编码 `role="buyer"`，商家/管理员无法查支付（严重，功能缺失式越权）
- **`backend/app/api/payments.py:23,38,54`**：三处写死 `get_order(db, order_id, user_id=user.id, role="buyer")`，导致商家查店铺订单、管理员查任意订单支付状态均 403。
- **修复方向**：`role=user.role.value`（或 `get_order` 内对 MERCHANT/ADMIN 放宽归属校验）。

### 3.8 角色鉴权混用字符串与枚举（严重，脆弱性）
- **`backend/app/services/support_service.py`** 多处 `user.role == "merchant"` / `"buyer"`（与同文件 `Role.MERCHANT` 混用）。当前因 `Role(str, Enum)` 恰好可用，但一旦改为非 str 枚举会**静默全部放行**。
- **修复方向**：统一用 `Role` 枚举比较；管理员分支显式声明是否放行（避免"都不命中→默认放行"的隐性逻辑）。

### 3.9 其他 Tier 2（轻微但应顺手修）
- `backend/app/api/notes.py:105` 种草笔记列表强制登录且无作者过滤 + N+1（20 条=61 次往返）：公开内容应允许匿名浏览，并批量预取 `User`/`NoteLike`。
- `backend/app/api/notes.py:35` 排序兜底魔数 `999` 在重复 id 时退化。
- `backend/app/api/report.py:57-74` 更新/删除任务全表拉取后内存过滤：改为按 `(id, merchant_id)` 直接查。
- `backend/app/api/upload.py:99,147` 魔数校验后的扩展名回退是死代码（不影响安全，属清理）。
- `backend/app/api/shops.py:40-41` 店铺评分统计未过滤下架商品，口径与商品数不一致。
- **安全**：`PAYMENT_SECRET`（`backend/app/core/config.py:36`）留弱默认值 `"change-me-in-prod-payment-secret"` 且未强制注入 → 支付回调验签可被伪造；应改为 `Field(...)` 必填（`.env` 已被 `.gitignore` 正确忽略，SECRET_KEY 不会进版本库，这点 OK，但需确认各环境 SECRET_KEY/PAYMENT_SECRET 不共用默认值）。

---

## 四、Tier 3 — UX 人性化（对标 Apple/Shopify/Nordstrom 简约精选风）

> 原则：保持简约，重点修"状态反馈缺失""信息架构未做减法""移动端不可用""价格/优惠不透明""表单校验缺失"。视觉令牌（颜色/间距）建议收敛统一，但不推翻现有风格。

### 4.1 系统性：消灭错误态伪装成空态（最高优先级 UX）
- **全站 ~30 处 `.catch(() => {})`**：`Orders.tsx:17`、`Cart.tsx:77`、`OrderDetail.tsx:93`、`Favorites.tsx:24`、`Coupons.tsx:88`、`Me.tsx:21`、`Pay.tsx:23`、`Search.tsx:35`、`Affiliate.tsx:35` 等，把"加载/接口失败"渲染成"暂无数据/订单丢了/购物车为空"。
- **修复方向**：引入 `useAsync(fetcher)` 统一 hook，返回 `{data, loading, error, retry}`；**三态分离**：loading（骨架屏）、empty（带引导 CTA）、error（带「重试」按钮）。Apple/Shopify 做法是绝不让用户分不清"真没数据"还是"出错了"。

### 4.2 移动端不可用（高优先级）
- **`frontend/src/layouts/MainLayout.tsx:223`**：搜索框 `hidden md:flex`，`<768px` 完全无搜索入口，底部 6 个 tab 也无搜索。
- **`MainLayout.tsx:310` / `MerchantLayout.tsx:118`**：底部导航 `grid-cols-6`（6 项），375px 上每格仅 62px；iOS HIG 建议 ≤5 项。
- **修复方向**：移动端在底部 tab 增加"搜索"项或顶部常驻搜索；底部 tab 收敛到 5 项。

### 4.3 信息架构未做减法（中优先级）
- **`MainLayout.tsx:30-53`**：17 个导航项，13 个塞进"更多▾"下拉（且 `max-h-80 overflow-y-auto`）。与简约精选风相悖——把混乱藏进抽屉不是减法。
- **修复方向**：合并同类项（积分/会员/优惠券→「我的权益」；种草/直播/预售→「发现」），一级导航控制在 5-7 项。

### 4.4 价格 / 优惠 / 转化不透明（高优先级，转化漏斗）
- **`ProductDetail.tsx:354`**：原价划线价**无条件渲染**，`displayPrice === p.price` 时显示 `~~¥199~~ ¥199`；变体加价时甚至出现"划线价比现价低"的虚假折扣（合规风险）。→ 仅当 `displayPrice < p.price` 才划原价。
- **`ProductDetail.tsx:232-236`**：收藏成功提示文案**完全颠倒**（取消收藏提示"收藏"，收藏成功提示"取消收藏"）。
- **`ProductDetail.tsx:271-294`**："立即购买"实际只是加购+跳购物车，且新商品默认**未勾选**（`selectedIds` 初始空），需再勾选再结算（5 步）。→ 直接携带商品跳结算页，或新加购默认选中。
- **`Cart.tsx:246-247`**：空购物车只有一个光秃秃 `Empty`，**无"去逛逛"按钮**（对比 `Favorites.tsx` 做对了）。→ 加行动引导 CTA。
- **`Cart.tsx:494-496` + `:413-427`**：结算按钮无金额、价格明细**缺运费行**（`:481` 又显示"预计送达"暗示有配送）。→ 结算按钮嵌入金额；补运费行（包邮也显式写"包邮"）；参照 `Pay.tsx:101` 的 `¥{money(order.total_amount)}`。

### 4.5 表单校验缺失（中优先级）
- **`frontend/src/pages/Address.tsx:117`**：手机号零校验（可填 `abc`），省市区是三个自由文本 `Input`（可填"火星/月球"）。→ 手机号正则 + 省市区级联选择器。
- **`Login.tsx:106`**：注册密码无强度要求、无二次确认、搜不到"忘记密码"入口；且 `Login.tsx:126-127` 把三组演示账号明文硬编码渲染在生产登录页。→ 加密码强度 + 确认密码 + 忘记密码；演示账号改为可一键填充而非明文罗列。

### 4.6 反馈与撤销（中优先级，精致度）
- **`Cart.tsx:340`**：数量修改每次整页重载（4 个接口并行），按住步进器 1→10 = 40 次请求 + 全屏 Spinner 闪烁。→ 防抖 300ms + 乐观更新。
- **全屏 Spinner 替换整页、无骨架屏**（`Cart.tsx:246`/`Orders.tsx:20`/`ProductDetail.tsx:243` 等十余处）→ 骨架屏保持结构稳定，消除 CLS 布局跳动。
- **`ProtectedRoute.tsx:19` + `Login.tsx:45`**：登录后不回跳原页面（从邮件点进 `/orders/xxx` 被踢登录后丢原目标）→ `navigate("/login", { state: { from } })` 登录后回跳。
- **`App.tsx:86-99`**：WebSocket 无重连/无错误处理，网络抖动一次实时通知静默失效 → 加 `onclose` 重连 + 指数退避。
- **全站无撤销机制**（`Cart.tsx:349` 删除、`Favorites.tsx:101` 取消收藏只有 `Popconfirm`）→ 改"免确认 + 5 秒撤销 Snackbar"（Gmail/Shopify 做法）。
- **`App.tsx:192`**：`path="*"` 静默重定向首页，错误链接不告知 → 用 `pages/Placeholder.tsx`（已存在但从未被路由引用）做 404 页面。

### 4.7 一致性清理（低优先级，长期债）
- 三套图标库并存（`@ant-design/icons` + `lucide-react` + `react-icons`）→ 收敛到一套。
- AntD 与 Tailwind 双主题 + 颜色硬编码散落（`#4F46E5` 出现十余次，又混用 `indigo-600`）→ 收敛设计 token。
- `LanguageProvider` 在 `main.tsx:26` 与 `App.tsx:121` 重复嵌套 → 去重。
- `api/index.ts` 单文件 53KB 无按域拆分 + 请求去重适配器被移除未补 → 按域拆分 + 恢复请求去重。
- `merchant/Coupons.tsx`、`admin/Coupons.tsx` 纯转发 stub → 路由层直接引用 `CouponManager`。

---

## 五、执行顺序建议（落地路线图）

| 阶段 | 内容 | 目的 |
|---|---|---|
| **阶段 A（止血，0.5-1 天）** | 1.1 variant_id 补列迁移 + 启动期暴露补列失败；1.2 merchant PDF import+关联；1.3 积分枚举；1.4 调度器补 db；1.5 notin_ 改造；1.6 Cart.tsx 编译；1.7 推荐 `.items` | 让核心链路能跑通、构建能过 |
| **阶段 B（资金/权限，1-2 天）** | 3.1 退款幂等+部分退；3.2 多商家分账；3.3 状态机上限；3.4 积分上限；3.5 领券行锁；3.6 券过期；3.7 支付角色；3.8 角色枚举统一；3.9 轻微项；config PAYMENT_SECRET 必填 | 堵住资损与越权 |
| **阶段 C（UX 系统性，3-5 天）** | 4.1 useAsync+三态；4.2 移动端搜索+底部5项；4.3 导航减法；4.4 价格/优惠/转化；4.5 表单校验；4.6 反馈/撤销/骨架屏/回跳/WS重连；4.7 一致性清理 | 达到"简约精选、状态清晰、移动可用" |

---

## 六、验证方式
- **后端**：启动后跑 `pytest`；重点用例覆盖 checkout、退款幂等/部分退、多商家分账、积分发放、领券并发、券过期、支付角色查询。
- **前端**：`npm run build` 必须通过（先灭 Tier 1 编译错误）；Playwright e2e 覆盖"加购→立即购买→结算→支付""移动端搜索""错误态重试"。
- **手测清单**：下单成功→完成订单→确认积分/成长/佣金到账；退款申请→确认只退申请金额且不可重复；优惠券过期后不可核销；商家/管理员可查对应支付状态。

---

## 七、备注（与项目既有约束的关系）
- 项目 `PLAN.md` 已声明「数据库变更必须新增 Alembic 迁移，不再依赖 `create_all` 演进」，但 `backend/app/main.py` 当前仍并存三套建表路径 —— Tier 1.1 的修复即把代码拉回该约束。
- 演示数据匿名化约束继续遵守（不写真实姓名/学校等）。
- 所有修复应配套单测，避免回到"测试绿灯但线上跑不通"的陷阱。
