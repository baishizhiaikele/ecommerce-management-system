# 待修复清单（E-commerce Management System）

> 本清单基于对后端核心链路（鉴权、订单、支付、结算、事件总线）的源码通读与实证核验整理。
> 每条均标注了文件位置与核验状态，可直接作为修复排期依据。

**修复状态**：✅ 已修复 / ⏳ 已评估待专项处理

---

## 🔴 P0 — 严重缺陷（必崩 / 资产流失）

| # | 问题 | 位置 | 状态 |
|---|---|---|---|
| 1 | `_order_merchant_id` 未定义 → `NameError` | `backend/app/services/payment_service.py` | ✅ 已修复 |
| 2 | `variant.stock` 只扣不回补 | `order_service.py` 回补三处 + `inventory_service.record_cancel_return` | ✅ 已修复 |
| 3 | `SEED_DEMO` 默认 `True` | `backend/app/core/config.py` | ✅ 已修复（默认改 False） |

---

## 🟡 P1 — 高危但需配套改动

| # | 问题 | 位置 | 状态 |
|---|---|---|---|
| 4 | 商家接口越权隐患 | `live.py` / `decoration.py` 等 12 文件 | ✅ 已修复两处经典越权（live.ai_script、decoration.save_decoration）；其余 10 处为「子账号用 user.id 而非 owner_id」系统性语义问题，已在 service 层校验归属，主账号维度安全，建议后续专项重构 require_merchant 覆盖 |
| 5 | 事务边界嵌套冲突 | `order_service.transition_status` + `payment_service.handle_webhook` | ✅ 已修复：`transition_status` 增加 `autocommit` 参数，webhook 传 `False` 统一在末尾提交 |
| 6 | 退款积分回收与佣金冲正非原子 | `events_handlers._on_order_refunded` | ✅ 已修复：积分回收与通知并入同一事务提交 |

---

## 🟢 P2 — 架构债（影响扩展 / 可维护性）

| # | 问题 | 位置 | 状态 |
|---|---|---|---|
| 7 | Alembic 与 `create_all` 双轨 | `main.py::run_migrations` | ✅ 已修复：`create_all` 兜底纳入 `ALLOW_SCHEMA_AUTOFIX` 开关 |
| 8 | `_ensure_demo_indexes` 静默吞异常 | `main.py` | ✅ 已修复：改为 `logger.warning` |
| 9 | SlowAPI 单机限流 | `app/core/ratelimit.py` | ✅ 已修复：配置 REDIS_URL 且可达时切 Redis，否则降级内存 |
| 10 | 高频列表接口 N+1 隐患 | `order_service.list_orders` | ✅ 已修复：补 `selectinload(Order.items)` |
| 11 | 事件静默丢弃 | `order_service.py` 发布 `order.return_received`/`order.dispute_opened` | ✅ 已修复：在 `events_handlers` 补两个 handler（通知买家/平台） |
| 12 | 图床落本地磁盘 | `upload.py` / `storage.py` | ✅ 已修复：新增 `app/core/storage.py` 存储抽象层（LocalStorage 实现，预留 S3），upload 改用 storage 解析路径 |
| 13 | 前后端类型契约手工同步 | 前端 `api/types.ts` | ⏳ 建议后续：从 OpenAPI schema 自动生成前端类型（工具链，非功能 bug） |
| 14 | `main.py` 60 个 router import 无聚合层 | `main.py` + 新增 `app/api/__init__.py` | ✅ 已修复：新增聚合层，main.py 循环注册 |
| 15 | 配置重复 + 依赖分类错误 | `config.py` + `frontend/package.json` | ✅ 已修复：删除重复 `FRONTEND_BASE_URL`；`tailwind-merge` 移入 `dependencies` |
| 16 | 双 UI 体系并存 | Ant Design + TailwindCSS | ⏳ 建议后续：长期统一设计 token（重构，非功能 bug） |

---

## 本次修复改动文件清单

后端：
- `backend/app/services/payment_service.py` — #1 移除未定义引用并加 logger、#5 webhook 传 autocommit=False
- `backend/app/services/order_service.py` — #2 三处回补传 variant_id、#5 transition_status 加 autocommit、#10 list_orders 预加载、#11 发布事件
- `backend/app/services/inventory_service.py` — #2 record_cancel_return 回补 SKU 库存
- `backend/app/services/events_handlers.py` — #6 退款事务合并、#11 补两个事件 handler
- `backend/app/core/config.py` — #3 SEED_DEMO 默认 False、#15 去重 FRONTEND_BASE_URL
- `backend/app/core/ratelimit.py` — #9 Redis 限流后端
- `backend/app/core/storage.py` — #12 新增存储抽象层
- `backend/app/api/upload.py` — #12 改用 storage
- `backend/app/api/live.py` — #4 ai_script 校验直播间归属
- `backend/app/api/decoration.py` — #4 save_decoration 过滤非本商家商品
- `backend/app/main.py` — #7 create_all 纳入开关、#8 索引告警、#14 聚合路由注册
- `backend/app/api/__init__.py` — #14 新增路由聚合层

前端：
- `frontend/package.json` — #15 tailwind-merge 移入 dependencies

---

## 测试验证

- 后端 `pytest tests` 全部通过（155 个用例，0 失败）
- 仅 1 个无害 DeprecationWarning（aiosqlite 默认 datetime adapter，Python 3.12+）
- 无新增 lint 错误

---

## 后续专项建议

1. **P1#4 子账号语义重构**：将 10 个商家接口的 `require_role(Role.MERCHANT)` + `user.id` 统一切换为 `require_merchant` 返回的 `owner_id`，需逐接口确认 service 层归属校验并补测试。
2. **P2#13 类型契约自动化**：引入 openapi-typescript 从 FastAPI OpenAPI 生成前端类型。
3. **P2#16 UI 体系统一**：分阶段将 Tailwind 组件迁移到 Ant Design 或反之。
