import { test } from "@playwright/test";

const ROUTES = [
  ["/", "首页(游客)"],
  ["/login", "登录页"],
  ["/auth/register", "/auth/register(注册模式路径)"],
  ["/register", "/register(直接访问)"],
  ["/products/1", "商品详情1"],
  ["/cart", "购物车(未登录应弹登录)"],
  ["/orders", "订单(未登录应弹登录)"],
  ["/me", "个人中心(未登录应弹登录)"],
  ["/merchant", "商家中心(需seller)"],
  ["/admin", "管理后台(需admin)"],
  ["/discover", "逛店铺/发现"],
  ["/favorites", "收藏"],
  ["/coupons", "优惠券"],
  ["/ai-mall", "AI商城"],
  ["/support", "客服"],
  ["/settings/notifications", "通知设置(需登录)"],
  ["/notifications", "通知中心(游客可看)"],
];

test("site tour - capture real state of each route", async ({ page }) => {
  const allConsole: Record<string, string[]> = {};
  const allPageErr: Record<string, string[]> = {};
  page.on("console", (m) => {
    if (m.type() === "error") (allConsole[page.url()] ||= []).push(m.text());
  });
  page.on("pageerror", (e) => (allPageErr[page.url()] ||= []).push(e.message));

  for (const [path, label] of ROUTES) {
    await page.goto(path);
    await page.waitForTimeout(1500);
    const url = page.url();
    const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
    const inputs = await page.locator("input,textarea").count();
    const buttons = await page.locator("button").count();
    console.log(`[${label}] path=${path} -> url=${url} | inputs=${inputs} btns=${buttons} | body="${body}"`);
  }

  console.log("\n===== CONSOLE ERRORS BY PAGE =====");
  for (const [u, errs] of Object.entries(allConsole)) {
    if (errs.length) console.log(`${u}\n  ${errs.slice(0, 5).join("\n  ")}`);
  }
  console.log("\n===== PAGE ERRORS BY PAGE =====");
  for (const [u, errs] of Object.entries(allPageErr)) {
    if (errs.length) console.log(`${u}\n  ${errs.slice(0, 5).join("\n  ")}`);
  }
});
