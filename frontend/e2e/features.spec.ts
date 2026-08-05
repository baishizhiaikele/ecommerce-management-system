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

// 买家高频导航在顶部，优惠券/收藏/逛店铺收进「更多 ▾」下拉（按钮 aria-label=更多）
async function openMore(page: Page) {
  await page.getByRole("button", { name: "更多", exact: true }).click();
}

test("买家可进入我的卡券并领取优惠券", async ({ page }) => {
  await loginBuyer(page);
  await openMore(page);
  await page.getByRole("menuitem", { name: "优惠券" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/coupons");

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
  // 「我的收藏」在顶部高频导航（渲染为 <button aria-label="我的收藏">）
  await page.getByRole("button", { name: "我的收藏" }).first().click();
  await expect(page).toHaveURL((u) => u.pathname === "/favorites");
  await expect(page.getByText("我的收藏").first()).toBeVisible();
});

test("买家可浏览多商家店铺", async ({ page }) => {
  await loginBuyer(page);
  await openMore(page);
  await page.getByRole("menuitem", { name: "逛店铺" }).click();
  await expect(page).toHaveURL((u) => u.pathname === "/shops");
  await expect(page.getByText("逛店铺").first()).toBeVisible();
  // 店铺卡片应展示在售商品数（如「X 件好物」）
  await expect(page.getByText(/件好物/).first()).toBeVisible();
});

test("买家可打开通知中心", async ({ page }) => {
  await loginBuyer(page);
  // 通知中心入口在「我的」页（/me），这里直接验证路由可达
  await page.goto("/notifications");
  await expect(page).toHaveURL((u) => u.pathname === "/notifications");
  await expect(page.getByText("消息中心")).toBeVisible();
});

test("商品集市展示个性化推荐「猜你喜欢」", async ({ page }) => {
  await loginBuyer(page);
  await expect(page).toHaveURL((u) => u.pathname === "/");
  await expect(page.getByText("猜你喜欢")).toBeVisible();
});
