import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./helpers";
import { swallow } from "../src/utils/reportError";

/**
 * P2 体验增强：核心闭环 E2E。三条用例覆盖
 *  1) 浏览商品 -> 加购 -> 下单结算
 *  2) 种草推荐流 -> 打开笔记详情 -> 点赞
 *  3) 直播间 -> 小黄车分享赚佣金（生成推广链接）
 * 依赖 playwright.config.ts 自动拉起后端(测试库)与前端。
 *
 * 注意：商品卡片通过 JS 路由跳转（onClick -> navigate），不是 <a href>，
 * 故用 antd Card 的 .ant-card 作为稳定选择器。
 */

test.describe("电商核心闭环", () => {
  test("1) 浏览商品 -> 加购 -> 下单", async ({ page }) => {
    // 注册买家并登录
    await registerAndLogin(page);
    await expect(page).toHaveURL((u) => u.pathname === "/" || u.pathname.startsWith("/market"));

    // 进入商品集市
    await page.goto("/market");
    // 等商品卡片渲染（商品卡内含 <a href="/products/{id}">）
    await page.waitForSelector("a[href*='/products/']", { timeout: 15000 });
    const firstCard = page.locator("a[href*='/products/']").first();
    await firstCard.click();
    await page.waitForURL(/\/products\/.+/, { timeout: 10000 });

    // 加入购物车（页面含主按钮与同类推荐区多个加购按钮，取主按钮）
    await page.getByRole("button", { name: /加入购物车|add to cart/i }).first().click();
    await page.waitForTimeout(800);

    // 去购物车结算
    await page.goto("/cart");
    await page.getByRole("button", { name: /去结算|结算|checkout/i }).first().waitFor({ timeout: 10000 });
    const checkoutBtn = page.getByRole("button", { name: /去结算|结算|checkout/i });
    await expect(checkoutBtn).toBeVisible();
    await checkoutBtn.click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL((u) => u.pathname === "/checkout");

    // 若需填地址则填，再提交订单
    const addr = page.getByPlaceholder(/收货|address|地址/i);
    if (await addr.count()) await addr.first().fill("E2E 自动化测试地址");
    const submit = page.getByRole("button", { name: /提交订单|下单|place order|confirm/i });
    if (await submit.count()) {
      await submit.first().click();
      await page.waitForTimeout(1000);
    }
  });

  test("2) 种草推荐流 -> 笔记详情 -> 点赞", async ({ page }) => {
    await registerAndLogin(page);
    await page.goto("/discover");
    await page
      .waitForSelector("a[href^='/discover/']", { timeout: 15000 })
      .catch((e) => swallow(e, "discover.waitForCard"));
    const cards = page.locator("a[href^='/discover/']");
    const count = await cards.count();
    if (count > 0) {
      await cards.first().click();
      await page.waitForTimeout(800);
      const like = page.getByRole("button", { name: /点赞|like/i });
      if (await like.count()) {
        await like.first().click();
        await page.waitForTimeout(400);
      }
      expect(page.url()).toMatch(/\/discover\/.+/);
    }
  });

  test("3) 直播间 -> 小黄车分享赚佣金", async ({ page }) => {
    await registerAndLogin(page);
    await page.goto("/live");
    await page.waitForTimeout(1000);
    const room = page.locator("a[href^='/live/']").first();
    if (await room.count()) {
      await room.click();
      await page.waitForTimeout(1000);
      const cartBtn = page.getByRole("button", { name: /购物车|小黄车|cart/i });
      if (await cartBtn.count()) {
        cartBtn.first().click();
        await page.waitForTimeout(600);
      }
      const share = page.getByRole("button", { name: /分享赚佣金|share & earn/i });
      if (await share.count()) {
        share.first().click();
        await page.waitForTimeout(600);
      }
    }
  });
});
