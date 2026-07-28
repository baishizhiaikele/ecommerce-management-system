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
  await page.goto("/settings/notifications");
  await expect(page.getByText("通知设置")).toBeVisible();
  // 取消某一分类的“接收”勾选 -> 触发免打扰
  const receive = page.getByRole("checkbox").first();
  if (await receive.isChecked()) {
    await receive.uncheck();
  }
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("设置已保存")).toBeVisible();
});

test("商家可打开经营报表页查看图表与定时任务", async ({ page }) => {
  await loginMerchant(page);
  await page.getByRole("menuitem", { name: "报表" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/merchant/reports");
  await expect(page.getByText("经营报表")).toBeVisible();
  await expect(page.getByText("定时任务")).toBeVisible();
});

test("商家可打开子账号管理页", async ({ page }) => {
  await loginMerchant(page);
  await page.getByRole("menuitem", { name: "子账号" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/merchant/staff");
  await expect(page.getByText("子账号管理")).toBeVisible();
});

test("买家在商品详情可打开 AR 试穿弹窗", async ({ page }) => {
  await loginBuyer(page);
  await page.getByPlaceholder("搜索商品").fill("手机");
  await page.keyboard.press("Enter");
  await page.locator(".ant-card").first().click();
  await page.getByRole("button", { name: "AR 试穿" }).click();
  await expect(page.getByText("AR 试穿").first()).toBeVisible();
  await expect(page.getByText(/摄像头预览中将叠加商品图/)).toBeVisible();
});
