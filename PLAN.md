# AI 全托管小店 — 开发计划

> 全栈电商管理平台：以电商为骨架（商品 / 购物车 / 订单状态机 / 三角色 RBAC / 仪表板），
> 以 **AI 深度集成** 为差异化灵魂（AI 店长一键生成文案定价、AI 智能客服、评论情感分析预警）。
> 项目目标：充实简历 + 作为毕业设计，可实际部署展示完整业务逻辑。

## 技术栈

- 后端：FastAPI + SQLAlchemy 2.0(异步) + Pydantic V2 + passlib(bcrypt) + python-jose(JWT)
- 前端：React 18 + TypeScript + Vite + Ant Design 5 + React Router 6 + Axios + Zustand + Tailwind
- 数据库：开发 SQLite，生产 PostgreSQL（同一 ORM，连接串经环境变量切换）
- 部署：后端 Dockerfile + uvicorn；前端静态构建；render.yaml 一键部署
- AI：OpenAI 兼容接口（可配置 base_url/key），无 key 时启用确定性 mock 降级

## 用户角色（RBAC）

| 角色 | 能力 |
|---|---|
| buyer 买家 | 浏览商品、加购、下单、评价、发起 AI 客服咨询 |
| merchant 商家 | 上架商品、AI 店长生成内容、发货、查看自己的数据看板 |
| admin 管理员 | 审核商品、管理用户、查看平台仪表板、查看审计日志 |

## 核心模块

1. 认证与 RBAC：JWT 双令牌（access+refresh）、令牌无感刷新、角色依赖注入
2. 商品与分类：分类树、商品 CRUD、库存、上架审核流（draft→pending→active/rejected）
3. 购物车与订单：购物车、结算、订单状态机（pending_payment→paid→shipped→completed / 退款分支）
4. AI 店长：基于商品信息一键生成标题 / 卖点文案 / 定价建议
5. AI 智能客服：买家在商品详情页发起会话，AI 基于商品上下文自动回复
6. 评价与情感：订单完成后评价，系统自动情感分析并预警差评
7. 仪表板：商家销售额 / 热销看板；管理员用户 / 商品 / 交易总览
8. 审计日志：关键写操作留痕，管理员可查

## 订单状态机

```
pending_payment --(buyer 支付)--> paid
paid --(merchant 发货)--> shipped
shipped --(buyer 确认收货)--> completed
paid --(buyer 申请退款)--> refund_requested
refund_requested --(merchant/admin 处理)--> refunded
```

流转由 `app/state_machine.py` 集中校验，防止越权。

## 架构

```
React(AntD) --/api--> FastAPI Router
                       |-- Auth & RBAC 依赖
                       |-- Service 层
                       |     |-- 订单状态机
                       |     |-- 事件总线 --> AI 服务 / 审计日志
                       |-- SQLAlchemy 模型 --> SQLite / PostgreSQL
```

## 目录

```
try/
├── backend/   FastAPI 应用（app/{core,db,models,schemas,services,api}）
├── frontend/  React 应用（src/{api,store,layouts,components,pages}）
├── PLAN.md    本计划
└── README.md  项目说明与部署
```

## 设计要点

- 写接口经依赖注入校验角色，越权返回 403
- 订单号 `ORD-YYYYMMDD-NNNN`，序列表 + 行锁保证并发唯一
- 支付为模拟确认（无真实支付网关），状态机推进即用
- AI 调用全程 try/except，超时或缺少 key 时返回 mock 文案，主流程不中断
- 审计：service 层统一调用 `audit_service.record()`
- 边界检查：库存不足拒绝结算、评价仅限本人已完成订单、价格/数量非负、分页参数校验

## 进度

- [x] 后端核心：schemas 补全、事件订阅接线、审计全量接入（含双令牌刷新 / 吊销轮换）
- [x] 商品 / 分类 / 购物车 / 订单 / 评价 / AI 客服 全量接口（端到端冒烟已通过）
- [x] 前端全部业务页面（React 18 + TS + AntD 5，生产构建 `BUILD_OK`）

  - 基础设施：axios 封装（401 自动无感刷新令牌）、角色路由守卫、三角色布局、刷新页面恢复登录态
  - 买家端：商品集市（搜索 / 分类筛选）、商品详情（加购 / AI 客服对话 / 评价展示）、购物车结算、订单列表 / 详情、订单状态机流转、已完成订单评价
  - 商家端：数据看板（销售额 / 订单 / 库存统计 + 7 天销售趋势图）、商品管理（CRUD + AI 店长一键生成标题 / 文案 / 定价建议）
  - 管理员端：平台仪表板、商品审核（通过 / 驳回）、用户管理（启用禁用 / 角色调整）、负面评价预警、审计日志

- [x] pytest 接口测试（27 项全绿：认证 / 商城主流程 / RBAC 越权）
- [x] Playwright 端到端冒烟测试（playwright.config.ts + e2e/smoke.spec.ts，覆盖鉴权重定向 / 买家 / 管理员登录）
- [x] Docker / render.yaml 部署配置与文档（多阶段 Dockerfile + render.yaml 单服务同源托管 + README 部署章节）
