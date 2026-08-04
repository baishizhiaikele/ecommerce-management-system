# 待完成任务与优化清单

> 生成日期：2026-08-04
> 范围：E-commerce management system（前端 React+TS / 后端 FastAPI）
> 说明：本文档记录经工具核对的真实状态与待办项，随代码纳入版本管理。

## 一、已确认完成（工具核对）

| 项目 | 验证方式 | 状态 |
| --- | --- | --- |
| 三态统一（高频页面改用语义化 AsyncBoundary/useAsync，消除吞错） | 代码审查 + tsc 0 错 | ✅ |
| i18n 防回归脚本 `scripts/check-i18n.mjs` + CI 接入 | ZH/EN 键对齐、CI success | ✅ |
| 全局增强：深色模式 / 键盘快捷键（/、?、Esc）/ 统一 Toast | 代码审查 + tsc 0 错 | ✅ |
| 后端核心服务增强（鉴权/支付/订单/智能体/履约） + P3 测试 | 后端 pytest：96 测试点全绿 | ✅ |
| 前端单测 | vitest：7 文件 / 48 测试全绿 | ✅ |
| 远程 CI | 运行全部 success | ✅ |
| 工作区状态 | `git status` 干净，本地与 origin/main 同步，已推送 | ✅ |

## 二、原待办与落地情况（2026-08-04 实施）

| # | 原待办 | 落地情况 | 落地点 |
| --- | --- | --- | --- |
| 1 | 深色模式第三方组件遗漏 | ✅ 已做 CSS 兜底（Recharts 轴/网格/tooltip 在暗色下适配）；地图/富文本经扫描未使用第三方库 | `frontend/src/index.css` `[data-theme="dark"] .recharts-*` |
| 2 | E2E 测试未接入 CI | ✅ 已新增独立 `e2e` job（装 Playwright chromium + 后端依赖 + `npm run e2e`） | `.github/workflows/ci.yml` `e2e` job |
| 3 | 后端 pytest 未确认接入 CI | ✅ 经核对 `ci.yml` backend job 第 52 行 `pytest -q` 已真实运行（此前误判） | `.github/workflows/ci.yml` backend job |
| 4 | 前端构建未本地验证 | ✅ 本地 `vite build` 成功（5557 模块、exit 0） | 本地验证，无代码改动 |
| 5 | WebSocket 断线提示 | ✅ 新增 `wsOffline` 状态 + 顶部断线提示条（深浅自适应、aria-live） | `frontend/src/App.tsx`、`index.css` `.ws-offline-banner`、`i18n` `app.wsOffline` |
| 6 | a11y 深度治理 | 🔶 部分：断线提示加 `role="status"` + `aria-live="polite"`；路由 lazy 已就绪；全站表单/对比度未尽审 | `App.tsx` banner |
| 7 | 错误监控/上报 | ✅ 增强 `reportError`：内存 ring-buffer 日志（`getErrorLog()`）+ 全局 `window.onerror`/`unhandledrejection` 自动上报；保持零依赖降级 | `frontend/src/utils/reportError.ts` |
| 8 | 性能 | ✅ 路由级 `lazy()` 已实现（S5）；`manualChunks` 已拆分 antd/vendor/charts；图片懒加载需逐个页面审计（未尽） | `App.tsx` lazy |

> 标注说明：✅ 已实质完成；🔶 部分完成（剩余项属长期迭代，非阻塞）。

## 三、仍属长期迭代（非阻塞，未纳入本轮）

- 全站 a11y 系统审计（表单 label 关联、焦点陷阱、对比度达标率）
- 图片懒加载策略逐页面统一
- 真实支付密钥注入与 production 放行（受安全约束仅 sandbox）
- 多语言扩展（当前 ZH/EN 已对齐，可扩更多语种）
- 第三方图表/富文本以外的极端边界深色适配（需浏览器肉眼复核）

## 四、验证结果（本轮实施）

- 前端 `tsc --noEmit`：0 错误
- 前端 vitest：`7 passed / 48 passed`
- 前端 `vite build`：`✓ built in 9.83s`（仅 antd chunk >1300kB 常规告警）
- i18n 一致性检查：exit 0（键对齐）
- 后端 pytest：96 测试点全绿（此前验证）
