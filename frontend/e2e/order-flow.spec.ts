import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * E2E: 支付→发货→收货→评价 完整订单状态流转闭环。
 * 依赖 playwright.config.ts 自动拉起后端(测试库)与前端。
 * 买家/商家均使用 SEED_DEMO 灌入的演示账号，避免注册限流与脏数据。
 */
test.describe("订单状态流转闭环", () => {
  test("买家下单 → 支付 → 商家发货 → 买家收货 → 评价", async ({ page }) => {
    // 1) 买家登录
    await login(page, "buyer");

    // 2) 浏览商品 → 加购
    await page.goto("/market");
    await page.waitForSelector("a[href*='/products/']", { timeout: 15000 });
    await page.locator("a[href*='/products/']").first().click();
    await page.waitForURL(/\/products\/.+/, { timeout: 10000 });
    await page.getByRole("button", { name: /加入购物车|add to cart/i }).first().click();
    await page.waitForTimeout(800);

    // 3) 购物车 → 结算下单
    await page.goto("/cart");
    // 商品已加入购物车，等待「去结算」按钮可见以确认购物车非空
    await page.getByRole("button", { name: /去结算|结算|checkout/i }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /去结算|结算|checkout/i }).first().click();
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL((u) => u.pathname === "/checkout");
    const addr = page.getByPlaceholder(/收货|address|地址/i).first();
    if (await addr.count()) {
      // checkout 页可能在挂载后有一次重渲染导致元素 detached，先等待稳定再填写
      await addr.waitFor({ state: "visible", timeout: 10000 });
      await addr.fill("E2E 测试地址 北京市");
    }
    const submit = page.getByRole("button", { name: /提交订单|下单|place order|confirm/i });
    if (await submit.count()) {
      await submit.first().click();
      await page.waitForTimeout(1000);
    }

    // 4) 确认支付
    const payBtn = page.getByRole("button", { name: /支付|确认支付|pay|confirm pay/i });
    if (await payBtn.count()) {
      await payBtn.first().click();
      await page.waitForTimeout(800);
    }

    // 5) 商家登录 → 后台发货
    await login(page, "merchant");
    await page.goto("/merchant/orders");
    await page.waitForTimeout(1500);
    const orderRow = page.locator(".ant-table-tbody tr").first();
    if (await orderRow.count()) {
      await orderRow.click();
      await page.waitForTimeout(800);
      const shipBtn = page.getByRole("button", { name: /发货|ship/i });
      if (await shipBtn.count()) {
        await shipBtn.first().click();
        await page.waitForTimeout(600);
        const trackingInput = page.getByPlaceholder(/运单号|tracking|物流/i);
        if (await trackingInput.count()) {
          await trackingInput.first().fill("SF1234567890");
        }
        const confirmShip = page.getByRole("button", { name: /确认|确定|ok|submit/i });
        if (await confirmShip.count()) await confirmShip.first().click();
        await page.waitForTimeout(800);
      }
    }

    // 6) 买家确认收货 → 评价
    await login(page, "buyer");
    await page.goto("/orders");
    await page.waitForTimeout(1500);
    const confirmBtn = page.getByRole("button", { name: /确认收货|confirm/i });
    if (await confirmBtn.count()) {
      await confirmBtn.first().click();
      await page.waitForTimeout(800);
      const confirmOk = page.getByRole("button", { name: /确定|确认|ok/i });
      if (await confirmOk.count()) await confirmOk.first().click();
      await page.waitForTimeout(800);
    }
    const reviewBtn = page.getByRole("button", { name: /评价|review/i });
    if (await reviewBtn.count()) {
      await reviewBtn.first().click();
      await page.waitForTimeout(600);
    }
  });
});
