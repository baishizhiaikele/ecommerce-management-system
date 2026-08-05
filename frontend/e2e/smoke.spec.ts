import { test, expect } from "@playwright/test";

// 冒烟测试覆盖核心链路：鉴权重定向、买家登录进入集市、管理员登录进入后台。
// 依赖 render.yaml / Dockerfile 中的单服务同源托管能力，由 playwright.config.ts 的
// webServer 自动拉起后端（含前端静态产物）。

test("未登录访问受保护路由跳转到登录页", async ({ page }) => {
  // 首页 / 集市对游客开放（guest 可浏览），受保护的订单页未登录须重定向登录
  await page.goto("/orders");
  await expect(page).toHaveURL((u) => u.pathname === "/login");
  await expect(page.getByPlaceholder("用户名")).toBeVisible();
  await expect(page.getByPlaceholder("密码")).toBeVisible();
});

test("买家登录后进入商品集市", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("buyer");
  await page.getByPlaceholder("密码").fill("buyer123");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL((u) => u.pathname === "/");
  // 集市页搜索框存在即证明 SPA 与商品接口整链路可用
  await expect(page.getByPlaceholder("搜索商品")).toBeVisible();
});

test("管理员登录后进入管理后台", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill("admin");
  await page.getByPlaceholder("密码").fill("admin123");
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL((u) => u.pathname.startsWith("/admin"));
  // 管理后台侧栏专属文案，验证角色路由与鉴权正确
  await expect(page.getByText("审计日志").first()).toBeVisible();
});
