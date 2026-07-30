# 对标主流电商的 UX 改造计划（已落地）

> 目标：对标淘宝 / 京东 / Amazon / Shopify，补齐本项目「细节体验」短板。
> 范围：**纯前端改造**（React + TS + Antd + Tailwind），无需后端改动。
> 状态：✅ 已全部实现（17 项），`tsc --noEmit` 0 错误，相关文件 lint 0 问题。

---

## 一、对标调研结论（差距分析）

| 对标对象 | 值得借鉴的布局 / 功能 | 本项目差距 |
|---|---|---|
| **Amazon** | PDP 五点卖点（bullets）、Buy Box、A+ 图文详情、评论按评分/有图筛选、同类推荐 rail | 缺五点卖点、缺评论筛选、缺同类推荐 |
| **淘宝 / 京东** | 服务承诺条（正品/退换/极速发货）、库存紧迫感文案、凑单、券后价、截单倒计时、吸底购买栏、顶栏全局搜索 | 缺信任背书、缺紧迫感、缺凑单/券后价、缺吸底栏、搜索割裂 |
| **Shopify** 优秀主题 | 留白与图片画廊（缩略图 + 悬停放大）、简洁筛选 chips | 图片单图、筛选仅单一 reset |
| **Baymard（结账 UX）** | 结构化地址选择、预计送达、最优券自动应用 | 购物车地址为纯文本、无送达预估、无最优券 |

### 优先级分级（实现前建议）
- **P0（体验底线，必做）**：PDP 图廊、服务承诺条、同类推荐、收藏、顶栏全局搜索、购物车结构化地址。
- **P1（转化提升）**：筛选 chips、空结果兜底、券后价/凑单、评价筛选、吸底购买栏、截单倒计时、库存紧迫感。
- **P2（细节加分）**：自动最优券、图廊悬停放大、五点卖点。

---

## 二、已实现清单（按优先级）

### P0
| 编号 | 项 | 文件 | 关键实现 |
|---|---|---|---|
| P0-1 | PDP 图片画廊 | `pages/ProductDetail.tsx` | 解析 `p.images` JSON + `image_url` 兜底；缩略图条 + `group-hover:scale-125` 悬停放大 |
| P0-2 | 服务承诺条 | `pages/ProductDetail.tsx` + `i18n` | `SERVICES` 常量（正品/退换/发货/运费/破损）+ 图标一排展示 |
| P0-3 | 同类推荐 | `pages/ProductDetail.tsx` + `listProducts({category_id})` | Tabs 后横向 rail-scroll，复用 `ProductCard` |
| P0-4 | 收藏 | `pages/ProductDetail.tsx` + `addFavorite/removeFavorite/isFavorited` | 加购/立即购买旁加 Heart 按钮，已收藏态切换 |
| P0-5 | 顶栏全局搜索 | `layouts/MainLayout.tsx` + `pages/Market.tsx` | 顶栏 input，回车/点击通过 URL `?kw=` 与 Market `useSearchParams` 联动 |
| P0-6 | 购物车结构化地址 | `pages/Cart.tsx` + `listAddresses/AddressOut` | `Select` 选择地址 + `formatAddr()`，加载时自动选默认地址 |

### P1
| 编号 | 项 | 文件 | 关键实现 |
|---|---|---|---|
| P1-1 | 五点卖点 | `pages/ProductDetail.tsx` | 规格后渲染 `attributes` 为 bullets 列表 |
| P1-2 | 吸底购买栏（移动端） | `pages/ProductDetail.tsx` | `fixed bottom-14` 栏，容器加 `pb-28 md:pb-0` |
| P1-3 | 筛选 chips | `pages/Market.tsx` | 可关闭 `Tag` 展示 kw/cat/rating/sort/price/inStock，替代单一 reset |
| P1-4 | 空结果兜底 | `pages/Market.tsx` | `Empty` + 提示 + 热搜词 `Tag` 引导 |
| P1-5 | 券后价 / 凑单 | `pages/Cart.tsx` | `assembleGap` 满减差额提示 + 券后价标签 `cart.finalPrice` |
| P1-6 | 评价筛选 | `components/ProductReviews.tsx` | 有图按钮 + 评分 `Select` + 清除，客户端过滤 |
| P1-7 | 截单倒计时 | `pages/Cart.tsx` | `cart.cutoff` 文案（每日截单时间提示） |
| P1-8 | 库存紧迫感 | `pages/ProductDetail.tsx` | 库存 ≤20 显示 `pd.lowStock` |

### P2
| 编号 | 项 | 文件 | 关键实现 |
|---|---|---|---|
| P2-1 | 自动最优券 | `pages/Cart.tsx` | 后端无 `/coupons/best`，前端用 `calcCouponDiscount`/`couponApplicable` 选最大折扣，「用最优券」按钮 |
| P2-2 | 预计送达 | `pages/Cart.tsx` | `estDate`（now+3 天）展示 `cart.estDelivery` |
| P2-3 | 图廊悬停放大 / 五点卖点 | `pages/ProductDetail.tsx` | 见 P0-1 / P1-1 |

---

## 三、i18n 新增键（中英文一一对应）
- `pd.servicePromise / pd.svcAuth / pd.svcReturn / pd.svcShip / pd.svcFreight / pd.svcBad / pd.sellingPoints / pd.related / pd.estDelivery / pd.lowStock / pd.galleryHint`
- `market.selectedFilters / market.clearAll / market.noResult / market.noResultHint / market.chip* / market.guessLike / market.searchBox`
- `cart.addressSelect / cart.estDelivery / cart.cutoff / cart.bestCouponOn / cart.useBest / cart.assembleHint / cart.finalPrice`
- `review.onlyImg / review.all / review.byRating`

---

## 四、关键技术决策与坑
1. **后端无 `/coupons/best` 接口** → 前端用 `calcCouponDiscount`/`couponApplicable` 自行计算最优券（P2-1）。
2. **图廊多图数据源**：商品 `images` JSON 字段解析，主图 `image_url` 兜底（P0-1）。
3. **同类推荐**：`listProducts({category_id})` 拉取（P0-3）。
4. **收藏接入**：复用已有 `addFavorite/removeFavorite/isFavorited`（P0-4）。
5. **搜索联动**：顶栏 `?kw=` + Market `useSearchParams` 双向（P0-5）。
6. **tsc 验证**：`tsc --noEmit` 经 PowerShell 重定向到 `c:\temp\tsc_out.txt` 读取，0 错误；移除了不存在的 `bestCoupon` 导入。

---

## 五、可继续打磨（未做，供后续）
- 图廊视频 / 360° 旋转展示
- 基于协同过滤的推荐算法（替代按分类拉取）
- 真实支付生产化、多仓发货、Redis 缓存、异步队列（见根 `PLAN.md` 下一步路线图）
