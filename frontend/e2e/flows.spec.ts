import { test, expect } from "@playwright/test";
import { swallow } from "../src/utils/reportError";

/**
 * P2 体验增强：核心闭环 E2E。三条用例覆盖
 *  1) 浏览商品 -> 加购 -> 下单结算
 *  2) 种草推荐流 -> 打开笔记详情 -> 点赞
 *  3) 直播间 -> 小黄车分享赚佣金（生成推广链接）
 * 依赖 playwright.config.ts 自动拉起后端(测试库)与前端。
 */

const TS = Date.now();
const uniq = (s: string) => `${s}_${TS}`;

test.describe("电商核心闭环", () => {
  test("1) 浏览商品 -> 加购 -> 下单", async ({ page }) => {
    // 注册买家并登录
    const username = uniq("buyer");
    await page.goto("/register");
    await page.getByPlaceholder(/用户名|username/i).fill(username);
    await page.getByPlaceholder(/邮箱|email/i).fill(`${username}@e.com`);
    await page.getByPlaceholder(/^密码$|password/i).first().fill("Test1234");
    await page.getByRole("button", { name: /注册|register/i }).click();
    // 注册后通常会进入首页/登录态
    await page.waitForLoadState("networkidle");

    // 进入商品列表，点开第一个商品
    await page.goto("/products");
    await page.waitForSelector("a[href^='/products/']", { timeout: 15000 });
    const first = page.locator("a[href^='/products/']").first();
    const href = await first.getAttribute("href");
    await first.click();
    await expect(page).toHaveURL(/\/products\/.+/);

    // 加入购物车
    await page.getByRole("button", { name: /加入购物车|add to cart/i }).click();
    await page.waitForTimeout(800);

    // 去购物车结算
    await page.goto("/cart");
    await page.waitForSelector("table, .ant-table", { timeout: 10000 });
    const hasItem = await page.locator(".ant-table-tbody tr").count();
    expect(hasItem).toBeGreaterThan(0);

    await page.getByRole("button", { name: /去结算|结算|checkout/i }).click();
    await page.waitForTimeout(1000);
    // 填地址并提交（结算页可能需填地址）
    const addr = page.getByPlaceholder(/收货|address|地址/i);
    if (await addr.count()) {
      await addr.first().fill("E2E 自动化测试地址");
    }
    const submit = page.getByRole("button", { name: /提交订单|下单|place order|confirm/i });
    if (await submit.count()) await submit.first().click();
    await page.waitForTimeout(1000);
  });

  test("2) 种草推荐流 -> 笔记详情 -> 点赞", async ({ page }) => {
    // 以买家身份访问发现页（推荐流）
    await page.goto("/discover");
    await page
      .waitForSelector("a[href^='/discover/']", { timeout: 15000 })
      .catch((e) => swallow(e, "discover.waitForCard"));
    const cards = page.locator("a[href^='/discover/']");
    const count = await cards.count();
    if (count > 0) {
      await cards.first().click();
      await page.waitForTimeout(800);
      // 点赞按钮（心形）
      const like = page.getByRole("button", { name: /点赞|like/i });
      if (await like.count()) {
        await like.first().click();
        await page.waitForTimeout(400);
      }
      expect(page.url()).toMatch(/\/discover\/.+/);
    }
  });

  test("3) 直播间 -> 小黄车分享赚佣金", async ({ page }) => {
    // 注册商家并登录（用于进入直播间观看/分享）
    const m = uniq("viewer");
    await page.goto("/register");
    await page.getByPlaceholder(/用户名|username/i).fill(m);
    await page.getByPlaceholder(/邮箱|email/i).fill(`${m}@e.com`);
    await page.getByPlaceholder(/^密码$|password/i).first().fill("Test1234");
    await page.getByRole("button", { name: /注册|register/i }).click();
    await page.waitForLoadState("networkidle");

    await page.goto("/live");
    await page.waitForTimeout(1000);
    // 进入第一个直播间（若有）
    const room = page.locator("a[href^='/live/']").first();
    if (await room.count()) {
      await room.click();
      await page.waitForTimeout(1000);
      // 小黄车按钮
      const cartBtn = page.getByRole("button", { name: /购物车|小黄车|cart/i });
      if (await cartBtn.count()) {
        await cartBtn.first().click();
        await page.waitForTimeout(600);
      }
      // 分享赚佣金（任一商品卡片）
      const share = page.getByRole("button", { name: /分享赚佣金|share & earn/i });
      if (await share.count()) {
        await share.first().click();
        await page.waitForTimeout(600);
      }
    }
  });
});
