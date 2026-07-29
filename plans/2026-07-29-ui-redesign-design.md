# 界面大幅美化 · 简约精选风设计（2026-07-29）

## 目标
页面"太拥挤" → 大幅度美化。参考 **Apple / Shopify / Nordstrom** 的简约精选风，而非信息密集的传统货架风。
范围：**全站含商家后台与管理端**。治理手段由实现者安排。

## 设计原则（从调研归纳）
- **做减法 + 强层次**：大留白、超大号 Hero、克制的分区标题、价格强对比，视线沿 F/Z 模式走。
- **统一栅格与卡片**：商品卡尺寸、圆角、阴影节奏统一，视觉整齐不碎。
- **首屏减负**：把"多级分类/主题频道/双榜单"等冗余竖插区块，改造成横向 rail（可滚动）或折叠发现区，释放首屏。
- **一致的间距节奏**：区块间距 56–72px，卡片内边距加大，行高放松。

## 设计系统（落地位置）
- `frontend/src/theme.ts`：加大圆角（radius 12/16）、柔和阴影、统一动效曲线。
- `frontend/src/index.css`：新增精选风工具类（见下方"令牌与类"）。
- 颜色沿用既有 brand 靛蓝 `#4F46E5`（≈ Tailwind `indigo-600`），保持单一强调色、中性灰阶梯。

### CSS 令牌
```
--space-section: 56px; --space-section-lg: 72px;
--radius-xl: 20px; --radius-2xl: 24px;
--shadow-card / --shadow-lift / --shadow-pop（更柔更轻）
--ease-soft: cubic-bezier(.22,.7,.3,1)
```
### 核心工具类
- `.page-shell`：受限宽度（1200/1280）+ 充足内边距。
- `.stack` / `.stack-lg`：相邻区块大留白。
- `.section-head` + `.eyebrow`：大字号分区标题，可挂右侧操作。
- `.hero-shell` / `.hero-caption`：大图圆角 Hero + 柔和暗化叠层。
- `.rail-head` / `.rail-scroll`：横向可滚动内容区（scroll-snap）。
- `.product-card` 增强：更大图、更多内边距、价格强对比、柔和抬升。
- `.card-soft` / `.card-lift`：通用表面卡片。
- `.chip` / `.chip-active`：分类胶囊。

## 实施顺序
1. 设计系统（theme + index.css）。✅ 进行中
2. 旗舰首页 Market 重构（减负 + 留白）。
3. MainLayout 顶部导航留白与节奏。
4. 核心买家页：Mall / 商品详情 / 购物车。
5. 商家后台布局与卡片。
6. 管理端布局与卡片。
7. 构建验证（tsc + vite build）并复验。

## 验收
- 首屏区块数显著减少、留白充足、不再像后台仪表盘。
- 商品卡尺寸/圆角/阴影统一，hover 柔和抬升。
- 全站视觉语言一致（买/商/管共用同一套令牌与工具类）。
- `tsc --noEmit` 通过，生产构建成功。
