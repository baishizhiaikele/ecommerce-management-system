import { test, expect } from "@playwright/test";

// 真实体验探针：不写死断言，像用户一样走流程，收集真实问题信号。
const ISSUES: string[] = [];

test("real-experience walkthrough", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(e.message));

  const snap = async (label: string) => {
    const url = page.url();
    const title = await page.title().catch(() => "?");
    const bodyLen = (await page.locator("body").innerText().catch(() => "")).length;
    const splash = await page.getByText(/加载中|loading|splash/i).count();
    console.log(`\n[${label}] url=${url} title="${title}" bodyLen=${bodyLen} splashMarkers=${splash}`);
  };

  // 1) 首页（游客）
  await page.goto("/");
  await page.waitForTimeout(2500);
  await snap("首页-游客");
  const productCards = await page.locator("a[href*='/products/']").count();
  console.log(`  商品卡数量=${productCards}`);
  if (productCards === 0) ISSUES.push("首页无任何商品卡片展示（游客视角）");

  // 2) 注册账号体验
  const u = "exp_" + Date.now().toString().slice(-6);
  const p = "Exp@12345";
  await page.goto("/register");
  await page.getByPlaceholder("用户名").fill(u);
  await page.getByPlaceholder("密码").fill(p);
  // 第二个密码框（确认）
  const pwds = page.getByPlaceholder("密码");
  if (await pwds.count() > 1) await pwds.nth(1).fill(p);
  const email = page.getByPlaceholder(/邮箱|email/i);
  if (await email.count()) await email.first().fill(u + "@test.com");
  await page.getByRole("button", { name: /注册|register/i }).first().click();
  await page.waitForTimeout(2000);
  await snap("注册后");
  const stillLogin = page.url().includes("/login");
  console.log(`  注册后是否仍在/login=${stillLogin}`);

  // 若注册未自动登录，手动登录
  if (stillLogin || !(await page.locator("body").innerText()).includes("首页") ? false : false) {
    await page.goto("/login");
    await page.getByPlaceholder("用户名").fill(u);
    await page.getByPlaceholder("密码").fill(p);
    await page.getByRole("button", { name: /登录|login/i }).first().click();
    await page.waitForTimeout(2000);
  }
  // 直接尝试登录确保进入
  await page.goto("/login");
  await page.waitForTimeout(800);
  await page.getByPlaceholder("用户名").fill(u).catch(() => {});
  await page.getByPlaceholder("密码").fill(p).catch(() => {});
  await page.getByRole("button", { name: /登录|login/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);

  // 3) 商品详情
  await page.goto("/");
  await page.waitForTimeout(2000);
  const firstCard = page.locator("a[href*='/products/']").first();
  if (await firstCard.count()) {
    await firstCard.click();
    await page.waitForTimeout(2000);
    await snap("商品详情");
    const addBtn = page.getByRole("button", { name: /加入购物车|add to cart/i });
    console.log(`  加入购物车按钮数=${await addBtn.count()}`);
    if (!(await addBtn.count())) ISSUES.push("商品详情页找不到「加入购物车」按钮");
    // 评价区
    const reviewText = (await page.locator("body").innerText()).match(/评价|reviews|暂无评价/i);
    console.log(`  评价区信号=${reviewText ? reviewText[0] : "无"}`);
  } else {
    ISSUES.push("首页无商品卡，无法进入详情");
  }

  // 4) 加购 → 购物车
  await page.goto("/cart");
  await page.waitForTimeout(2000);
  await snap("购物车");
  const checkoutBtn = page.getByRole("button", { name: /去结算|结算|checkout/i });
  console.log(`  去结算按钮数=${await checkoutBtn.count()}`);
  if (!(await checkoutBtn.count())) ISSUES.push("购物车页无「去结算」按钮（可能为空车但无空态提示）");

  // 5) 下单流程
  if (await checkoutBtn.count()) {
    await checkoutBtn.first().click();
    await page.waitForTimeout(2500);
    await snap("结算/下单页");
    const payBtn = page.getByRole("button", { name: /提交订单|支付|确认下单|pay|submit order/i });
    console.log(`  提交订单按钮数=${await payBtn.count()}`);
    if (!(await payBtn.count())) ISSUES.push("结算页无「提交订单」按钮");
  }

  // 6) 订单列表
  await page.goto("/orders");
  await page.waitForTimeout(2000);
  await snap("订单列表");

  // 7) 通知设置页（之前崩过的页面）
  await page.goto("/settings/notifications");
  await page.waitForTimeout(2000);
  await snap("通知设置");
  const crashMarker = await page.getByText(/user is not defined|TypeError|Cannot read/i).count();
  if (crashMarker) ISSUES.push("通知设置页出现 JS 崩溃文案");

  // 8) 商家中心（模拟 seller 角色访问）
  await page.goto("/seller");
  await page.waitForTimeout(1500);
  await snap("商家中心 /seller");
  const forbidden = (await page.locator("body").innerText()).match(/403|无权限|forbidden|禁止/i);
  if (forbidden) ISSUES.push("访问商家中心被拒（当前账号非卖家，预期内但需确认有引导）");

  console.log("\n===== CONSOLE ERRORS =====");
  console.log(consoleErrors.slice(0, 30).join("\n") || "(无)");
  console.log("\n===== PAGE ERRORS =====");
  console.log(pageErrors.slice(0, 30).join("\n") || "(无)");
  console.log("\n===== ISSUES FOUND =====");
  console.log(ISSUES.length ? ISSUES.join("\n") : "(本轮体验未捕获明显阻断问题)");
  // 不断言失败，仅输出；用 expect 占位以满足 Playwright
  expect(true).toBe(true);
});
