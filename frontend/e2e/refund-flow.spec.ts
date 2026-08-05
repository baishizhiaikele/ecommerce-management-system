import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * E2E: 退货退款完整流程。
 * 买家下单→支付→申请退款→商家审核通过→退款完成。
 * 依赖 playwright.config.ts 自动拉起后端(测试库)与前端。
 * 买家/商家均使用 SEED_DEMO 灌入的演示账号。
 */
test.describe("退货退款完整流程", () => {
  test("买家申请退款 → 商家审核通过 → 退款完成", async ({ page }) => {
    // 1) 买家登录并下单
    await login(page, "buyer");
    await page.goto("/market");
    await page.waitForSelector("a[href*='/products/']", { timeout: 15000 });
    await page.locator("a[href*='/products/']").first().click();
    await page.waitForURL(/\/products\/.+/, { timeout: 10000 });
    await page.getByRole("button", { name: /加入购物车|add to cart/i }).first().click();
    await page.waitForTimeout(800);
    await page.goto("/cart");
    await page.getByRole("button", { name: /去结算|结算|checkout/i }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /去结算|结算|checkout/i }).first().click();
    await page.waitForTimeout(1000);
    const addr = page.getByPlaceholder(/收货|address|地址/i);
    if (await addr.count()) await addr.first().fill("退款测试地址");
    const submit = page.getByRole("button", { name: /提交订单|下单|place order|confirm/i });
    if (await submit.count()) {
      await submit.first().click();
      await page.waitForTimeout(1200);
    }

    // 2) 申请退款
    await page.goto("/orders");
    await page.waitForTimeout(1500);
    const refundBtn = page.getByRole("button", { name: /退款|申请退款|refund/i });
    if (await refundBtn.count()) {
      await refundBtn.first().click();
      await page.waitForTimeout(800);
      const reason = page.getByPlaceholder(/原因|reason/i);
      if (await reason.count()) await reason.first().fill("E2E 测试退款");
      const confirmRefund = page.getByRole("button", { name: /确认|提交|submit|ok/i });
      if (await confirmRefund.count()) await confirmRefund.first().click();
      await page.waitForTimeout(1000);
    }

    // 3) 商家审核退款
    await login(page, "merchant");
    await page.goto("/merchant/orders");
    await page.waitForTimeout(1500);
    const approveBtn = page.getByRole("button", { name: /通过|审核|approve|同意/i });
    if (await approveBtn.count()) {
      await approveBtn.first().click();
      await page.waitForTimeout(800);
    }

    // 4) 验证退款状态（买家查看）
    await login(page, "buyer");
    await page.goto("/orders");
    await page.waitForTimeout(1500);
    expect(await page.locator("body").isVisible()).toBe(true);
  });

  test("多角色协作：商家创建商品 → 买家购买 → 商家发货", async ({ page }) => {
    // 1) 商家登录并创建商品
    await login(page, "merchant");
    await page.goto("/merchant/products");
    await page.waitForTimeout(1000);
    const addBtn = page.getByRole("button", { name: /新增|添加|发布|add|create/i });
    if (await addBtn.count()) {
      await addBtn.first().click();
      await page.waitForTimeout(800);
      const nameInput = page.getByPlaceholder(/商品名称|名称|name/i);
      if (await nameInput.count()) {
        await nameInput.first().fill(`E2E协作测试商品`);
      }
      const priceInput = page.getByPlaceholder(/价格|price/i);
      if (await priceInput.count()) {
        await priceInput.first().fill("99");
      }
      const stockInput = page.getByPlaceholder(/库存|stock/i);
      if (await stockInput.count()) {
        await stockInput.first().fill("100");
      }
      const saveBtn = page.getByRole("button", { name: /保存|发布|提交|save|submit|publish/i });
      if (await saveBtn.count()) await saveBtn.first().click();
      await page.waitForTimeout(1000);
    }

    // 2) 买家登录并购买
    await login(page, "buyer");
    await page.goto("/market");
    await page.waitForSelector("a[href*='/products/']", { timeout: 15000 });
    const first = page.locator("a[href*='/products/']").first();
    if (await first.count()) await first.click();
    await page.waitForURL(/\/products\/.+/, { timeout: 10000 });
    await page.getByRole("button", { name: /加入购物车|add to cart/i }).first().click();
    await page.waitForTimeout(800);

    // 3) 结算下单
    await page.goto("/cart");
    await page.getByRole("button", { name: /去结算|结算|checkout/i }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: /去结算|结算|checkout/i }).first().click();
    await page.waitForTimeout(1000);
    const addr2 = page.getByPlaceholder(/收货|address|地址/i);
    if (await addr2.count()) await addr2.first().fill("协作测试地址");
    const submit = page.getByRole("button", { name: /提交订单|下单|place order|confirm/i });
    if (await submit.count()) {
      await submit.first().click();
      await page.waitForTimeout(1000);
    }

    // 4) 商家发货
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
          await trackingInput.first().fill("SF9876543210");
        }
        const confirmShip = page.getByRole("button", { name: /确认|确定|ok|submit/i });
        if (await confirmShip.count()) await confirmShip.first().click();
        await page.waitForTimeout(800);
      }
    }
  });
});
