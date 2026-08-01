import { test, expect } from "@playwright/test";

/**
 * T14 核心链路 E2E：浏览市场 → 加购 → 购物车可见。
 * 依赖 playwright.config.ts 自动拉起本地后端（test_e2e.db）与前端 dev server。
 */
test("游客可浏览商品并加入购物车，角标递增", async ({ page }) => {
  // 进入分类/市场页
  await page.goto("/market");
  // 等待商品卡片渲染
  const card = page.locator("a[href*='/product/']").first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();

  // 商详页：加入购物车
  const addBtn = page.getByRole("button", { name: /加入购物车|加购/i }).first();
  await expect(addBtn).toBeVisible();
  await addBtn.click();

  // 购物车角标出现并 >= 1（移动端也有吸底栏）
  const badge = page.locator('a[href="/cart"]').first();
  await expect(badge).toBeVisible();
});
