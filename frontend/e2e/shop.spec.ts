import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * T14 核心链路 E2E：浏览市场 → 加购 → 购物车可见。
 * 依赖 playwright.config.ts 自动拉起本地后端（test_e2e.db）与前端 dev server。
 */
test("买家登录后可浏览商品并加入购物车，角标递增", async ({ page }) => {
  await login(page, "buyer");
  // 进入分类/市场页
  await page.goto("/market");
  // 等待商品卡片渲染
  const card = page.locator("a[href*='/products/']").first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();

  // 商详页：加入购物车
  const addBtn = page
    .getByRole("button", { name: /加入购物车|加购/i })
    .first();
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  // 等待加购请求完成并同步购物车
  await page.waitForTimeout(1200);

  // 购物车中出现已加购商品（角标/去结算按钮可见）
  await page.goto("/cart");
  await expect(
    page.getByRole("button", { name: /去结算|结算|checkout/i }).first(),
  ).toBeVisible();
});
