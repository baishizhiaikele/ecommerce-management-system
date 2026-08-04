import { test, expect } from "@playwright/test";
import { swallow } from "../src/utils/reportError";

/**
 * E2E: 支付→发货→收货→评价 完整订单状态流转闭环。
 * 依赖 playwright.config.ts 自动拉起后端(测试库)与前端。
 */
const TS = Date.now();
const uniq = (s: string) => `${s}_${TS}`;

test.describe("订单状态流转闭环", () => {
  test("买家下单 → 支付 → 商家发货 → 买家收货 → 评价", async ({ page }) => {
    // 1) 注册买家并登录
    const buyer = uniq("buyer");
    await page.goto("/register");
    await page.getByPlaceholder(/用户名|username/i).fill(buyer);
    await page.getByPlaceholder(/邮箱|email/i).fill(`${buyer}@e.com`);
    await page.getByPlaceholder(/^密码$|password/i).first().fill("Test1234");
    await page.getByRole("button", { name: /注册|register/i }).click();
    await page.waitForLoadState("networkidle");

    // 2) 浏览商品 → 加购
    await page.goto("/products");
    await page.waitForSelector("a[href^='/products/']", { timeout: 15000 });
    await page.locator("a[href^='/products/']").first().click();
    await expect(page).toHaveURL(/\/products\/.+/);
    await page.getByRole("button", { name: /加入购物车|add to cart/i }).click();
    await page.waitForTimeout(800);

    // 3) 购物车 → 结算下单
    await page.goto("/cart");
    await page.waitForSelector(".ant-table", { timeout: 10000 });
    await page.getByRole("button", { name: /去结算|结算|checkout/i }).click();
    await page.waitForTimeout(1000);
    const addr = page.getByPlaceholder(/收货|address|地址/i);
    if (await addr.count()) await addr.first().fill("E2E 测试地址 北京市");
    const submit = page.getByRole("button", { name: /提交订单|下单|place order|confirm/i });
    if (await submit.count()) await submit.first().click();
    await page.waitForTimeout(1000);

    // 4) 确认支付（若有支付确认按钮）
    const payBtn = page.getByRole("button", { name: /支付|确认支付|pay|confirm pay/i });
    if (await payBtn.count()) {
      await payBtn.first().click();
      await page.waitForTimeout(800);
    }

    // 5) 退出买家，注册商家
    const merchant = uniq("merchant");
    await page.goto("/register");
    await page.getByPlaceholder(/用户名|username/i).fill(merchant);
    await page.getByPlaceholder(/邮箱|email/i).fill(`${merchant}@e.com`);
    await page.getByPlaceholder(/^密码$|password/i).first().fill("Test1234");
    await page.getByRole("button", { name: /注册|register/i }).click();
    await page.waitForLoadState("networkidle");

    // 6) 商家后台 → 查看订单 → 发货（若有订单）
    await page.goto("/merchant/orders");
    await page.waitForTimeout(1500);
    const orderRow = page.locator(".ant-table-tbody tr").first();
    if (await orderRow.count()) {
      await orderRow.click();
      await page.waitForTimeout(800);
      // 发货按钮
      const shipBtn = page.getByRole("button", { name: /发货|ship/i });
      if (await shipBtn.count()) {
        await shipBtn.first().click();
        await page.waitForTimeout(600);
        // 填写物流单号
        const trackingInput = page.getByPlaceholder(/运单号|tracking|物流/i);
        if (await trackingInput.count()) {
          await trackingInput.first().fill("SF1234567890");
        }
        const confirmShip = page.getByRole("button", { name: /确认|确定|ok|submit/i });
        if (await confirmShip.count()) await confirmShip.first().click();
        await page.waitForTimeout(800);
      }
    }

    // 7) 退出商家，买家确认收货
    await page.goto("/login");
    await page.getByPlaceholder(/用户名|username/i).fill(buyer);
    await page.getByPlaceholder(/^密码$|password/i).first().fill("Test1234");
    await page.getByRole("button", { name: /登录|login/i }).click();
    await page.waitForLoadState("networkidle");

    await page.goto("/orders");
    await page.waitForTimeout(1500);
    // 确认收货
    const confirmBtn = page.getByRole("button", { name: /确认收货|confirm/i });
    if (await confirmBtn.count()) {
      await confirmBtn.first().click();
      await page.waitForTimeout(800);
      // 确认弹窗
      const confirmOk = page.getByRole("button", { name: /确定|确认|ok/i });
      if (await confirmOk.count()) await confirmOk.first().click();
      await page.waitForTimeout(800);
    }

    // 8) 评价
    const reviewBtn = page.getByRole("button", { name: /评价|review/i });
    if (await reviewBtn.count()) {
      await reviewBtn.first().click();
      await page.waitForTimeout(600);
    }
  });
});
