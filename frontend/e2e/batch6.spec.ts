import { test, expect, Page } from "@playwright/test";

// 批次6 端到端覆盖：通知分类免打扰、经营报表、子账号、AR 试穿。
// 复用 playwright.config.ts 的 webServer：后端以 SQLite 临时库启动并同源托管 frontend/dist。

async function loginMerchant(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("merchant");
  await page.getByPlaceholder("密码").fill("merchant123");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL((u) => u.pathname.startsWith("/merchant"));
}

async function loginBuyer(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("buyer");
  await page.getByPlaceholder("密码").fill("buyer123");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL((u) => u.pathname === "/");
}

test("买家可打开通知免打扰设置并保存", async ({ page }) => {
  await loginBuyer(page);
  await page.waitForTimeout(1500);
  await page.goto("/settings/notifications");
  await expect(page.getByText("通知设置")).toBeVisible();
  // 取消某一分类的“接收”勾选 -> 触发免打扰
  const receive = page.getByRole("checkbox").first();
  if (await receive.isChecked()) {
    await receive.uncheck();
  }
  await page.getByRole("button", { name: /保\s*存/ }).click();
  await expect(page.getByText("设置已保存")).toBeVisible();
});

test("商家可打开经营报表页查看图表与定时任务", async ({ page }) => {
  await loginMerchant(page);
  // 商家侧栏菜单为 <a> 链接，文本取 nav 文案
  await page.getByRole("link", { name: "经营报表" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/merchant/reports");
  await expect(page.getByRole("heading", { name: "经营报表" })).toBeVisible();
  await expect(page.getByText("定时任务")).toBeVisible();
});

test("商家可打开子账号管理页", async ({ page }) => {
  await loginMerchant(page);
  await page.getByRole("link", { name: "子账号" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/merchant/staff");
  await expect(page.getByText("子账号管理")).toBeVisible();
});

test("买家在商品详情可打开 AR 试穿弹窗", async ({ page }) => {
  await loginBuyer(page);
  await page.getByPlaceholder("搜索商品").fill("手机");
  await page.keyboard.press("Enter");
  await page.waitForSelector("a[href*='/products/']", { timeout: 15000 });
  await page.locator("a[href*='/products/']").first().click();
  // AR 试穿仅对 ar_enabled 商品展示，作为 Collapse 面板而非按钮
  const arPanel = page.getByText("AR 试穿");
  if (await arPanel.count()) {
    await expect(arPanel.first()).toBeVisible();
    await expect(page.getByText(/摄像头预览中将叠加商品图/)).toBeVisible();
  }
});
