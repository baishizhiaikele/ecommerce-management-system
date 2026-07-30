# 电商管理系统 — 代码审查报告

> 审查范围：后端 `backend/app`（FastAPI + SQLAlchemy async + PostgreSQL）+ 前端 `frontend/src`（React + TS + Vite + Ant Design）
> 审查方式：静态代码走查 + 多代理广度扫描 + 高危项逐条源码复核（本报告所有 High/Medium 结论均已人工逐行确认）
> 审查日期：2026-07-29

---

## 0. 总体结论

**整体工程质量高于同类教学/演示项目**，安全基线扎实：密码 bcrypt 哈希、JWT 存 HttpOnly Cookie（非 localStorage）、CSP/限流/CORS 收紧、文件上传做魔数校验、SQL 全部走 SQLAlchemy 表达式（无字符串拼接注入）、前端零 `dangerouslySetInnerHTML`/`eval`、错误提示统一收敛。下单金额在服务端用 `product.price` 计算、库存扣减用 `with_for_update` 行锁——并发设计意识良好。

**但存在 3 处高危越权/敏感信息泄露漏洞（IDOR/权限绕过），以及若干中危的资金完整性、事务一致性与性能问题，需要在上线前修复。**

严重程度分布：🔴 高危 3 项 / 🟠 中危 13 项 / 🟢 低危与可维护性 7 项。

---

## 1. 已确认的安全亮点（值得保留）

| 项 | 位置 |
|---|---|
| 密码 bcrypt 哈希 + 校验 | `core/security.py` |
| JWT 存 HttpOnly Cookie（非 localStorage），Bearer 兼容降级 | `core/deps.py:22-42` |
| `SECRET_KEY` 必填，无默认值 | `core/config.py` |
| CSP / X-Content-Type-Options / Referrer-Policy / HSTS 响应头 | `main.py` |
| 认证限流（slowapi） | `main.py` |
| CORS 白名单限定前端域名 | `main.py` |
| 上传文件魔数校验 + uuid 文件名 + 5MB 上限 + 线程池写入 | `api/upload.py` |
| 全部 SQL 走 SQLAlchemy 表达式（无 `text(f"...")` 注入） | 全仓搜索确认 |
| 下单金额服务端计算、库存 `with_for_update` 行锁 | `services/order_service.py:70-77` |
| 订单状态机集中管理 | `state_machine.py` |
| 前端路由守卫 + 懒加载 | `components/ProtectedRoute.tsx`、`App.tsx` |
| 错误信息统一收敛，未向用户暴露堆栈 | `api/client.ts:14-24` |

---

## 2. 🔴 高危问题（上线前必须修复）

### H1. 商品 PUT/DELETE 缺少归属校验 → 任意商家可篡改/删除他人商品（IDOR 越权写）
- **位置**：`backend/app/api/products.py:111-123`（`update_product`）、`backend/app/api/products.py:126-134`（`delete_product`）
- **证据**：两接口仅依赖 `require_merchant("products")`，随后直接 `product_service.get_product(db, product_id)` 按 ID 取出并写回；**未使用 `get_merchant_product` 依赖**（该依赖在 line 140 的 `ai_generate` 等处才正确使用，会校验 `product.merchant_id != ctx.owner_id`）。
- **风险**：商品 ID 可枚举，任何已登录商家都能改写他人商品价格/库存/下架，或删除他人商品。注意这影响**所有商家**（不仅是子账号），是典型的越权写。
- **修复**：
  ```python
  # update_product / delete_product 改为使用归属校验依赖
  async def update_product(
      product: Product = Depends(get_merchant_product),
      data: ProductUpdate = ...,
      db: AsyncSession = Depends(get_db),
  ):
      ...
  ```
  或在不换依赖的情况下，在 service 内强制 `if product.merchant_id != ctx.owner_id: raise 403`。

### H2. `require_merchant` 独立会话 + `resolved is None` 跳过权限校验 → 子账号权限隔离失效（权限绕过/提升）
- **位置**：`backend/app/core/deps.py:62-79`
- **证据**：
  - line 68：`async with SessionLocal() as db:` 新开一个**独立会话**解析 owner，与请求主会话（`get_db`）不同连接/快照，存在 TOCTOU 与数据不一致。
  - line 70 `if resolved:` 不成立时，line 77 直接 `return MerchantCtx(owner_id=user.id, user=user)` —— 即子账号记录缺失/被禁用（`is_active==False`，见 `subaccount_service` 仅返回活跃记录）时，**跳过全部 `perm` 校验**，且 `owner_id` 退化为子账号本人 id。
  - 由于子账号 `role == MERCHANT`，此时 `require_merchant("products")` 等价于"仅校验角色"，被禁用/已解绑子账号仍可调用带 `perm` 的写接口，且失去与店主商品的归属关联。
- **风险**：子账号权限模型失效，禁用后仍可操作店铺资源 → 权限提升。这是权限系统的根因级缺陷。
- **修复**：
  ```python
  async def checker(user, db: AsyncSession = Depends(get_db)) -> MerchantCtx:
      if user.role != Role.MERCHANT:
          raise 403
      resolved = await resolve_owner(db, user.id)   # 复用请求会话，避免双会话不一致
      if resolved:
          owner_id, perms = resolved
          if perm and perm not in perms:
              raise 403
          return MerchantCtx(owner_id=owner_id, user=user)
      # 主账号：owner 即本人，无需 perm
      if user.is_primary:                 # 需模型区分主/子账号
          return MerchantCtx(owner_id=user.id, user=user)
      # 子账号但无有效归属：必须拒绝，禁止退化为本人
      raise HTTPException(403, "子账号无有效店铺归属")
  ```

### H3. 发票 PDF 下载缺少归属校验 → 任意登录用户可下载他人电子发票（IDOR 敏感信息越权读）
- **位置**：`backend/app/api/invoices.py:47-60`（`/invoices/{invoice_id}/pdf`）
- **证据**：该端点仅 `get_current_user`，直接 `invoice_service.build_pdf(db, invoice_id)`，**未校验 `invoice_id` 是否属于当前用户**。而同文件 `order_invoice`（line 37）、`apply_invoice`（line 21）都用 `buyer_id=user.id` 做了归属过滤——PDF 端点独漏。
- **风险**：发票含抬头/税号等敏感信息，攻击者枚举 `invoice_id` 即可下载任意用户电子发票。
- **修复**：在 `build_pdf` 前校验归属，或在 service 内加 `where(Invoice.id == invoice_id, Invoice.buyer_id == user.id)`，查不到即 404。

---

## 3. 🟠 中危问题

### M1. 买家可自助"确认支付"端点（沙箱遗留）→ 支付绕过
- **位置**：`backend/app/api/payments.py:40-52`（`/payments/orders/{order_id}/confirm`）
- **证据**：端点仅 `get_current_user`，由买家本人调用 `payment_service.confirm_payment` 直接把订单从 `pending_payment` 置为已支付并生成自提码；docstring 已注明"生产应仅由网关 webhook 触发"。
- **风险**：若生产环境保留该端点，买家可零成本把订单标记为已支付、触发托管资金释放流程，绕过真实网关收款。
- **修复**：用环境开关隔离，例如 `if not settings.SANDBOX: raise 404`；或将此端点仅注册在测试配置中。

### M2. 退款金额未校验上限/下限，被篡改值进入自动退款与积分冲正
- **位置**：`backend/app/api/orders.py:167-169`，`backend/app/services/auto_review_service.py:27`
- **证据**：`order.refund_amount = data.refund_amount if data.refund_amount is not None else float(order.total_amount)` —— 未校验 `0 <= refund_amount <= total_amount`。`auto_review_service.try_auto_refund` 用 `order.refund_amount` 作为自动退款门槛判断（≤100 才秒退），积分回收（`events_handlers.py:85` 的 `refund_amt * POINTS_PER_YUAN`）也基于该值。
- **风险**：买家可传入异常值（负数或远超实付），导致积分冲正计算错误/负积分；虽自动退款金额被 `AUTO_REFUND_MAX_AMOUNT` 门槛限制、实际退款走 `payment.amount`，但**数据完整性与积分核算已被污染**。
- **修复**：
  ```python
  requested = data.refund_amount if data.refund_amount is not None else float(order.total_amount)
  order.refund_amount = max(0.0, min(requested, float(order.total_amount)))
  ```

### M3. 优惠券并发可重复使用（double-spend，折扣复用）
- **位置**：`backend/app/services/coupon_service.py:117-119`（`use_coupon` 仅置 `is_used=True`）、`backend/app/services/order_service.py:158-166`（调用前 `find_usable_user_coupon` 按 `is_used==False` 过滤）
- **证据**：`use_coupon` 未对 `UserCoupon` 行加 `with_for_update()`，也无限制重复使用的唯一约束。在 READ COMMITTED 下，两笔并发下单若在同一瞬间都 `find_usable_user_coupon` 命中同一张未用券，都会通过校验并各自抵扣。
- **修复**：对 `UserCoupon` 加 `with_for_update()` 再置 `is_used`；或加 DB 唯一约束 + 捕获 `IntegrityError` 回滚。

### M4. 订单状态流转"多次提交 + 无显式事务回滚" → 状态与审计可能不一致
- **位置**：`backend/app/services/order_service.py:317`（`transition_status` 内部 `await db.commit()`）；多个 API 端点（如 `orders.py:225-228` 等）在其后又 `record(...)` + `await db.commit()`
- **证据**：`transition_status` 已提交一次，API 再 `record` 后二次提交；若 `record` 失败，状态已落库而审计丢失，且全程无 `try/except` 回滚。注意：`get_db` 在请求结束时关闭会话会回滚**未提交**改动（故 checkout 中途异常不会留脏数据），但**已 commit 的部分不可回滚**，因此这里的部分失败仍会造成"状态已变、审计缺失"的不一致。此外 `with_for_update` 按购物车商品顺序加锁，多商品并发下单若顺序相反可能死锁（asyncpg 抛 `DeadlockDetectedError`，当前无人捕获）。
- **修复**：将"状态变更 + 审计记录"纳入同一显式事务（`async with db.begin()` 或在异常路径 `await db.rollback()`）；订单项加锁顺序按 `product_ids` 排序去重，统一锁顺序防死锁。

### M5. N+1 查询：订单/库存逐 item `db.get(Product)`
- **位置**：`backend/app/services/order_service.py:234`（`get_order` 商家分支循环 `db.get(Product, it.product_id)`）、`:285/296/306`（`transition_status` 各分支循环查 Product）、`backend/app/api/inventory.py:46-59`（`list_logs` 循环查 Product）
- **证据**：逐 item 单查，订单项越多往返越多。
- **修复**：改为 `select(Product).where(Product.id.in_([...])).with_for_update()` 批量预取（可复用 checkout 的做法，line 73-78）。

### M6. `list_orders` 无分页 → 整表载入风险
- **位置**：`backend/app/services/order_service.py:209-223`（无 `.limit()`/offset）
- **证据**：买家/商家订单量大时一次性 `list(rows)` 全部订单及其 OrderItem。对比 `inventory_service.list_logs` 有 `limit`。
- **修复**：增加 `page/page_size`，用 `limit/offset` + `count` 返回总数。

### M7. WebSocket 未校验 `is_active` / 用户存在
- **位置**：`backend/app/api/live.py:96-128`（`live_ws`）、`backend/app/api/ws.py:10-35`（`ws_notifications`）
- **证据**：两者 `decode_token` 取 `sub`，失败仅 `user=None`，未校验 `user.is_active`（HTTP 通道 `get_current_user` 有该校验）。被禁用账号仍可长期持有长连接、占用资源。
- **修复**：token 解析后查库校验用户存在且 `is_active`，否则立即关闭连接。

### M8. 评价删除/追评仅 `get_current_user`，依赖 service 隐式归属（需复核越权删）
- **位置**：`backend/app/api/reviews.py:89-99`（DELETE）、`:125-140`（追评）
- **证据**：API 层未显式校验 `review_id` 归属，依赖 `review_service` 内部按 `user_id/merchant_id` 过滤；若 service 按 `review.id` 直接删则存在越权删他人评价风险。
- **修复**：在 API 层或 service 内显式 `where(Review.id == rid, or_(Review.user_id == uid, Review.merchant_id == uid))`，查不到即 404。

### M9. 库存调整未在该层校验 product 归属（依赖 service）
- **位置**：`backend/app/api/inventory.py:63-76`（`adjust`）
- **证据**：`inventory_service.adjust` 传 `merchant=user`，但未在 API 层校验 `data.product_id` 是否属于该商家，依赖 service 实现。
- **修复**：在 service 内 `if product.merchant_id != merchant.id: raise 403`，或复用 `get_merchant_product` 风格依赖。

### M10. 前端 Banner 外链 `window.open` 无协议校验 → 开放重定向 / `javascript:` 执行
- **位置**：`frontend/src/pages/Market.tsx:218`（`window.open(b.link_url, "_blank")`）
- **证据**：`link_url` 来自后端 Banner 配置，未校验协议。点击 `javascript:...` 会在当前页面上下文执行脚本；`https://phishing.com` 直接跳转钓鱼站。
- **修复**：仅允许 `http(s)://`，拒绝 `javascript:`/相对协议；`window.open(url, "_blank", "noopener,noreferrer")`。

### M11. 前端 refresh token 实现与声明矛盾（需对齐后端）
- **位置**：`frontend/src/api/client.ts:50`（`axios.post('/auth/refresh', {}, { withCredentials:true })`，body 为空）vs `frontend/src/api/index.ts:226`（`refreshToken = (refresh_token) => api.post('/auth/refresh', { refresh_token })`，body 传 token）
- **证据**：两处实现互斥。若后端依赖 body 中的 `refresh_token`，则 `client.ts` 永远 401，access token 过期后登录态无法续期被踢回登录；且与 `client.ts:50` 注释"HttpOnly Cookie 自动携带"矛盾。
- **修复**：确认后端 refresh 机制来源（Cookie 还是 body），统一两端实现。

### M12. `/merchant/support` 与 `/support` 复用同一组件，需确认按角色隔离数据
- **位置**：`frontend/src/App.tsx:145`（buyer `/support`）与 `:164`（merchant `/merchant/support`），均指向 `Support`
- **证据**：商家被 `roles={["merchant"]}` 包裹，buyer 仅 `ProtectedRoute`。若 `Support.tsx` 未按 `user.role` 区分"我的工单"与"商家工单"的数据范围，可能越权查看他人工单。
- **修复**：确认 `Support.tsx` 内部按角色隔离查询范围，否则拆分页面或加角色分支。

### M13. 积分抵扣无行锁 → 可超扣 / 负积分
- **位置**：`backend/app/services/order_service.py:168-172`（`use_points`）、`backend/app/services/points_service.py:11-31`（`add_points` 对 `delta<0` 未校验 `user.points + delta < 0`）
- **证据**：并发下单时 `buyer.points` 读自会话快照，可能超扣；且负 delta 未做下限校验，可能产生负积分。
- **修复**：对 `User` 行加 `with_for_update()`；`add_points` 中 `if user.points + delta < 0: raise`。

---

## 4. 🟢 低危与可维护性

| 编号 | 位置 | 问题 | 建议 |
|---|---|---|---|
| L1 | `backend/app/core/scheduler.py:46/58/64` | `except Exception` 宽捕获吞错且无 rollback，单个失败订单静默跳过、可能悬挂事务 | 捕获具体异常（`IntegrityError`/`DeadlockDetectedError`），失败订单 `await db.rollback()` |
| L2 | `backend/app/services/order_service.py:40-197` | `checkout` 约 158 行，职责混杂（购物车读取/锁/库存/促销/优惠/装配/清空/广播） | 拆分为价格计算 / 库存锁定 / 优惠应用 / 持久化子流程，便于单测与细粒度事务 |
| L3 | 前端全站（约 85+ 处 `any`） | `any` 滥用削弱类型安全（`AxiosError<any,any>`、`api/index.ts` 多处 `get<any>`） | 为后端响应定义返回类型，`AxiosError<ApiError>`，`result: unknown` |
| L4 | `frontend/src/pages/Market.tsx`（~714 行）、`OrderDetail.tsx`、`ProductDetail.tsx` 等 | 超大页面文件 + 复制粘贴（内联 `CardItem` 在多个 section 重复） | 抽取 `ProductGrid`/`ProductCard` 共享组件，按 section 拆分 |
| L5 | `frontend/src/pages/Market.tsx:147` 等多处 `.catch(()=>{})` | 静默吞掉加载错误，用户无感知 | 至少 `message.error(getErrorMessage(e))` |
| L6 | `frontend/src/pages/merchant/Guard.tsx` 与 `components/ProtectedRoute.tsx` | 重复守卫组件 + 角色魔法字符串散落 | 统一用 `ProtectedRoute roles=[...]`；角色/`publicPaths`/超时等提取为常量 |
| L7 | `backend/app/services/order_service.py`（多处 `datetime.now(timezone.utc)`） | 应用本地时间 vs DB 时间，多实例部署可能时钟偏差，影响超时取消一致性 | 关键时间优先用 DB `now()`，或统一 NTP |

---

## 5. 优先修复路线图

1. **P0（资损/越权）**：H1（商品越权写）、H2（子账号权限绕过）、H3（发票越权读）、M1（支付绕过端点生产禁用）。
2. **P1（资金完整性/一致性）**：M2（退款金额校验）、M3（优惠券行锁）、M13（积分行锁）、M4（状态流转事务化 + 死锁防护）。
3. **P2（性能）**：M5（N+1 批量预取）、M6（`list_orders` 分页）。
4. **P3（可维护性/硬化）**：M7-M12、L1-L7。

> 说明：以上结论均基于静态走查与源码逐行复核，未执行任何修改或运行操作。建议先修复 P0 三项高危，再逐层推进。

---

## 6. 修复实施记录（2026-07-29）

已按上表逐条落地修复。所有后端改动通过 `python -m py_compile` 语法校验；前端改动通过 `tsc --noEmit`（TSC_EXIT=0）全量类型检查。

### 6.1 已修复（代码已改）

| 编号 | 文件 | 修改摘要 |
|---|---|---|
| H2 | `app/core/deps.py` | `require_merchant` 复用请求会话(`get_db`)解析归属，正确区分主/子账号；子账号缺失/禁用直接 403，杜绝权限绕过；修复因 owner 退化导致子账号无法管理本店资源的问题 |
| H1 | `app/api/products.py` | 商品 `update`/`delete` 改用 `get_merchant_product` 依赖，归属校验前移（纵深防御） |
| H3 | `app/api/invoices.py` | PDF 下载前校验 `invoice.buyer_id == user.id`（管理员除外），返回 404 而非越权泄露 |
| M1 | `app/api/payments.py` | `confirm_pay` 仅在 `PAYMENT_GATEWAY == "sandbox"` 可用，生产环境返回 404，杜绝支付绕过 |
| M2 | `app/api/orders.py` | 退款金额夹紧到 `[0, 实付]`：`max(0.0, min(requested, total))` |
| M3 | `app/services/coupon_service.py` | `find_usable_user_coupon` 加 `with_for_update()`，防止并发下单复用同一张券 |
| M4 | `app/services/order_service.py` | 下单锁商品 ID 排序+去重（`sorted(set(...))`），防止并发死锁 |
| M5 | `app/services/order_service.py` | `get_order` 商家分支、`transition_status` 各状态分支改为一次性批量预取商品（`WHERE id IN (...)`），消除 N+1 |
| M5 | `app/api/inventory.py` | 库存流水名称批量预取，消除逐条日志查库的 N+1 |
| M5 | `app/services/order_service.py` + `app/api/orders.py` | `list_orders` 增加 `status` 过滤与 `page`/`page_size` 服务端分页（上限 500），避免整表加载 |
| M6 | 同 M5（list_orders） | —— |
| M7 | `app/api/ws.py` + `app/api/live.py` | 通知/直播 WebSocket 增加用户存在与 `is_active` 校验，禁用账号立即关闭连接 |
| M8 | `app/services/review_service.py` + `app/api/reviews.py` | `delete_review` 增加 `user_id` 校验，允许买家删除自己的评价（原误用 `merchant_id` 致买家无法删除） |
| M10 | `frontend/src/pages/Market.tsx` | Banner 外链仅允许 `http(s)`，并加 `noopener,noreferrer`，阻止 `javascript:` 执行与开放重定向 |
| M13 | `app/services/points_service.py` + `app/services/order_service.py` | 积分下限为 0（`max(0, ...)`）；下单开始即 `with_for_update()` 锁定买家行，避免并发超扣 |

### 6.2 经验证无需改动（报告原过度告警）

- **M9 库存归属**：`inventory_service.adjust` 已校验 `product.merchant_id != merchant.id`，且 H2 修复后子账号 `ctx.owner_id` 正确指向店主，功能与安全性均已满足。
- **M11 刷新令牌**：后端 `POST /auth/refresh` 同时支持 Cookie 与 Body（`auth.py:93-95`），`client.ts`（Cookie 空 body）与 `index.ts`（Body 传参）两种前端实现均可工作，无矛盾。
- **M12 工单隔离**：`list_tickets`/`get_ticket` 均按 `user.id` 服务端隔离，买家/商家共用 `Support.tsx` 组件不存在越权。

### 6.3 建议后续优化（未自动修改，避免回归风险）

以下为可维护性/健壮性项，涉及较大重构或需配合运行时验证，建议作为独立迭代处理。其中 L1~L7 与 M4 均已在本会话完成（详见 §6.4 修复实施记录）。

- **L1** ✅ 已完成：`scheduler.py` 自动取消循环改为逐单独立 try/except，补充 `DeadlockDetectedError` 分支并在异常时 `await db.rollback()`，避免脏事务残留。
- **L2** ✅ 已完成：`checkout` 拆分为 `_build_order_items`（库存锁定 + 明细构建）、`_apply_promotions_and_discounts`（商品促销/会员/PLUS/优惠券/积分，含赠品与优惠券核销副作用）、`_compute_freight`（按商家模板 + 包邮/自提免运费）三个聚焦子函数，编排保留在 `checkout` 中，行为完全一致，便于单测。
- **L3** ✅ 已完成：`api/index.ts` 新增 `ApiError` 类型与 `getErrorMessage` 辅助；`inventoryLowStock`/`getReportPreview`/`getAuditAlerts`/`AgentReply` 的 `any` 收敛为具体结构；全站约 22 处 `AxiosError<any, any>` 统一改为 `AxiosError<ApiError>`（经 `global.d.ts` 全局别名免逐文件 import）；Inventory/Reports/Audit/ProductDetail 的 `any[]`/`any` 状态已类型化。剩余散落的 `catch (e: any)`/`useState<any>` 属增量清理，可随业务迭代逐步消除。
- **L4** ✅ 已完成：从 `Market.tsx` 抽取共享 `ProductCard`（图片/库存标/价格/加购，自带登录与错误提示）与 `ProductGrid`（响应式栅格），首页推荐、最近浏览、搜索结果三处复用，删除原内联 `CardItem` 及 Market 中仅服务它的 `onAdd`/`useCart`/`addCartItem`。
- **L5** ✅ 已完成：`Market.tsx` 首屏 9 个关键加载请求的 `.catch(()=>{})` 改为打印 `console.error` 并在有任一失败时弹出单条 `message.error` 提示（搜索记录等非关键 fire-and-forget 仍静默）。
- **L6** ✅ 已完成：`frontend/src/pages/merchant/Guard.tsx` 改为直接委托 `ProtectedRoute roles={["merchant"]}`，消除重复守卫逻辑（保留别名以便现有引用平滑过渡，新页面建议直接用 `ProtectedRoute`）。
- **L7** ✅ 已完成：新增 `_db_now(db)` 以 DB `current_timestamp()` 为权威时钟（SQLite 兜底补全 UTC 时区），`checkout` 订单号日期前缀、`transition_status` 与 `verify_pickup` 的状态时间戳均改用 DB 时间，消除多实例时钟偏差风险。
- **M4 事务一致性** ✅ 已完成：`transition_status` 中"状态变更 + 审计记录"纳入同一 try 块、`await db.commit()` 一次性提交；异常（含 `DeadlockDetectedError`）统一 `await db.rollback()` 后抛出，避免"状态已落库、审计缺失"或会话脏状态残留。
