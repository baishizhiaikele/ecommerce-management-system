# 前端用户体验（UX）优化记录

> 本文档随代码维护，记录前端的UX/可访问性（a11y）改进，便于团队检视与回归。
> 所有改动均通过 `tsc --noEmit`、`vitest` 单测，以及新增的 `npm run check:i18n` 一致性校验。

## 一、统一的三态加载基础设施

项目已具备可复用的异步边界组件，所有数据页应统一采用，避免「静默吞错」：

- `src/hooks/useAsync.ts`：封装 loading / error / data 三态。
- `src/components/AsyncBoundary.tsx`：渲染 loading（骨架/Spinner）、error（带重试 `retry`）、empty（带 `emptyAction` 引导）三态，错误态 `role="alert"`、`aria-busy` 读屏提示。
- `src/components/EmptyState.tsx`：统一空态插画 + 引导操作。

**核心修复**：多个页面此前用 `loading` 布尔 + `catch { /* 忽略 */ }` 老写法，网络失败时界面静默变空白或误显示「无数据」。现已统一为：加载失败 → 明确错误态 + 重试按钮；空数据 → 引导操作；二者不再混淆。

## 二、本轮（覆盖全部高频模块）改动清单

| 模块 | 文件 | 关键改进 |
|---|---|---|
| 购物车 | `src/pages/Cart.tsx` | 删除可撤销、数量步进器、未登录有出口、错误/空态区分 |
| 商品卡片 | `src/components/ProductCard.tsx` | 加购 loading 防连点、收藏态由父级传入、商品名键盘可达 |
| 异步边界 | `src/components/AsyncBoundary.tsx` | `aria-busy`、读屏文案、错误态 `role="alert"` |
| 空状态 | `src/components/EmptyState.tsx` | 支持描述与自定义插图/引导按钮 |
| 全局样式 | `src/index.css` | `.sr-only`、禁用态 `not-allowed`、移动端 44px 触控区、`prefers-reduced-motion` |
| 结算 | `src/pages/Checkout.tsx` | 三态区分、错误态「返回购物车」出口 |
| 订单详情 | `src/pages/OrderDetail.tsx` | 修复静默吞错：loading / 加载失败+重试 / 404 三态 |
| 优惠券 | `src/pages/Coupons.tsx` | `AsyncBoundary` 三态、领取按钮 loading 防连点、空态引导 |
| 消息通知 | `src/pages/Notifications.tsx` | load/标记已读失败给反馈、「全部已读」loading 防连点、错误重试 |
| 积分 | `src/pages/Points.tsx` | load 失败→错误态+重试、历史空态引导 |
| 客服工单 | `src/pages/Support.tsx` | 列表 load 吞错修复→`Result` 重试，区分「无工单」与「加载失败」 |
| 店铺 | `src/pages/Shop.tsx` | 关注/取关失败反馈、仅在成功后改状态、按钮 loading 防连点 |
| 会员 | `src/pages/Membership.tsx` | load 失败→空态补「重试」按钮 |
| 商品详情 | `src/pages/ProductDetail.tsx` | load 吞错修复→错误态+重试，与「商品不存在」区分 |
| 搜索 | `src/pages/Search.tsx` | 关键词搜索失败不再静默变空白→错误态+重试；区分加载失败/无结果 |
| 多语言 | `src/i18n/zh.ts`、`src/i18n/en.ts` | 补齐缺失 key，中英各 1772 键双向对齐 |

## 三、可访问性（a11y）要点

- **键盘导航**：所有交互元素可 Tab 到达；商品名使用真实 `<a>` 而非仅 `onClick` 的 `div`，装饰性图片设 `aria-hidden` 避免重复焦点。
- **读屏兼容**：错误提示 `role="alert"`、加载态 `aria-busy`、空态提供清晰描述；提供 `.sr-only` 隐藏文案类。
- **触控友好**：移动端最小点击区 44px，符合 WCAG 2.5.5。
- **动效降级**：`prefers-reduced-motion` 下关闭非必要动画。
- **明确反馈**：所有主操作按钮在请求中显示 `loading` 防连点；破坏性操作（删除/清空）提供确认或可撤销。

## 四、i18n 防回归机制（新增）

目的：防止新增文案时漏写 key（否则线上显示原始 key 字符串）。

- 扫描脚本：`frontend/scripts/check-i18n.mjs`
  - 扫描 `src` 下所有 `t("key")` / `translate("key")` 引用（支持嵌套点号 key，跳过含 `${}` 的动态拼接）。
  - 对比 `zh.ts` / `en.ts` 扁平 key 表，任一语言包缺 key 即非零退出。
- 命令：`npm run check:i18n`
- 已接入：
  - CI：`.github/workflows/ci.yml` 的 frontend job 增加 `npm run check:i18n` 步骤。
  - 部署：`backend/Dockerfile` 在 `npm run build` 前执行 `npm run check:i18n`，Render 构建阶段即拦截缺 key。

## 五、验证结果

- `npx tsc --noEmit`：0 错误。
- `npm run test`（vitest）：全部单测通过。
- `npm run check:i18n`：中英文 1772 键双向对齐，无缺失。

## 六、全局增强（已实施）

### 1. 深色模式
- `src/theme.ts` 导出 `darkTheme`（基于 antd `darkAlgorithm` + 暗色 token/组件覆盖）。
- `src/hooks/useTheme.ts`：管理浅/深状态，localStorage 持久化，首访读取系统 `prefers-color-scheme`，并写入 `<html data-theme>`。
- `src/App.tsx` 用 `ConfigProvider theme={isDark ? darkTheme : theme}` 包裹，接入主题。
- `src/index.css` 末尾 `[data-theme="dark"]` 块：重映射 `--brand-*` 变量（所有引用 `var()` 的卡片/表面/文字自动变暗）+ 覆盖组件里写死的 Tailwind 浅色工具类（`.bg-white`/`.text-slate-*`/`.border-slate-*` 等）+ 玻璃/极光背景、滚动条、选区、`kbd` 样式。
- `src/layouts/MainLayout.tsx` header 增加主题切换按钮（Sun/Moon 图标，`aria-pressed`）。

### 2. 键盘快捷键
- `src/hooks/useShortcuts.ts`：全局监听，`/` 跳搜索并聚焦、`?` 打开帮助面板；输入态（input/textarea/contenteditable）不触发。
- `src/App.tsx` 挂载一次并渲染快捷键帮助 `Modal`（列出 `/`、`?`、`Esc`）。
- `src/pages/Search.tsx` 支持 `?focus=1` 自动聚焦输入框。

### 3. 统一 Toast
- `src/utils/toast.ts`：封装 antd `message`，提供 `toast.success/error/info/warning/loading/open`，含默认时长与短时间相同内容去重；旧 `message.xxx` 调用无需改动（零回归）。
- `src/App.tsx` WebSocket 通知改用 `toast.info`。

## 七、后续可选增强（未在本轮实施）

- 将 `AsyncBoundary` 接入更多低频页面（如退款、直播、促销页）以保持一致性。
- 全局 Toast 进一步与 `App.useApp()` 联动以支持多实例/上下文主题（当前统一封装基于静态 message，已满足全局一次性提示需求）。
