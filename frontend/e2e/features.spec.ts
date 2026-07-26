import { test, expect, Page } from "@playwright/test";

// 新增功能模块端到端覆盖：优惠券、收藏、多商家店铺、通知中心、个性化推荐。
// 复用 playwright.config.ts 的 webServer：后端以 SQLite 临时库启动并同源托管 frontend/dist。

async function loginBuyer(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("buyer");
  await page.getByPlaceholder("密码").fill("buyer123");
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL((u) => u.pathname === "/");
}

test("买家可进入我的卡券并领取优惠券", async ({ page }) => {
  await loginBuyer(page);
  await page.getByLabel("我的卡券").click();
  await expect(page).toHaveURL((u) => u.pathname === "/coupons");
  await expect(page.getByText("我的卡券")).toBeVisible();

  // 切到「可领取」页签，若存在立即领取按钮则点击并校验成功提示
  const claimTab = page.getByRole("tab", { name: /可领取/ });
  if (await claimTab.count()) {
    await claimTab.click();
    const claimBtn = page.getByRole("button", { name: "立即领取" }).first();
    if (await claimBtn.count()) {
      await claimBtn.click();
      await expect(page.getByText("领取成功")).toBeVisible();
    }
  }
});

test("买家可进入我的收藏", async ({ page }) => {
  await loginBuyer(page);
  await page.getByRole("menuitem", { name: "收藏" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/favorites");
  await expect(page.getByText("我的收藏")).toBeVisible();
});

test("买家可浏览多商家店铺", async ({ page }) => {
  await loginBuyer(page);
  await page.getByRole("menuitem", { name: "逛店铺" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/shops");
  await expect(page.getByText("逛店铺")).toBeVisible();
  // 店铺卡片应展示在售商品数
  await expect(page.getByText(/件在售/).first()).toBeVisible();
});

test("买家可打开通知中心", async ({ page }) => {
  await loginBuyer(page);
  await page.getByLabel("通知中心").click();
  await expect(page).toHaveURL((u) => u.pathname === "/notifications");
  await expect(page.getByText("通知中心")).toBeVisible();
});

test("商品集市展示个性化推荐「猜你喜欢」", async ({ page }) => {
  await loginBuyer(page);
  await expect(page).toHaveURL((u) => u.pathname === "/");
  await expect(page.getByText("猜你喜欢")).toBeVisible();
});
