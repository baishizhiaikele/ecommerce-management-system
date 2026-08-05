import { Page } from "@playwright/test";

// 演示账号（由后端 SEED_DEMO 灌入独立测试库 test_e2e.db）。
// 注意：按项目安全约定，演示账号不含真实个人信息。
export const DEMO = {
  buyer: { username: "buyer", password: "buyer123" },
  merchant: { username: "merchant", password: "merchant123" },
  admin: { username: "admin", password: "admin123" },
};

export type DemoAccount = keyof typeof DEMO;

/** 用演示账号登录（注册链路以外的测试优先用此，避免触发注册限流）。 */
export async function login(
  page: Page,
  account: DemoAccount | { username: string; password: string } = "buyer",
) {
  const { username, password } =
    typeof account === "string" ? DEMO[account] : account;
  await page.goto("/login");
  await page.getByPlaceholder("用户名").fill(username);
  await page.getByPlaceholder("密码").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => u.pathname !== "/login", { timeout: 10000 }).catch(
    () => {},
  );
}

/**
 * 走 UI 注册一个新买家账号并登录。
 * 注册成功后前端会回到登录页（mode=login），需再登录一次才能获得会话。
 * 使用随机用户名避免与已存在账号冲突，也规避注册限流（5/min）。
 */
export async function registerAndLogin(page: Page) {
  const username = `u${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const password = "Test1234";
  const email = `${username}@example.com`;

  await page.goto("/login");
  // 切到注册模式：Ant Segmented 的 radio input 隐藏，需点击可见的"注册"项
  await page.locator(".ant-segmented-item").filter({ hasText: "注册" }).click();
  await page.getByPlaceholder("用户名").fill(username);
  await page.getByPlaceholder("邮箱").fill(email);
  await page.getByPlaceholder("密码").first().fill(password);
  await page.getByPlaceholder("确认密码").fill(password);
  // 登录/注册共用同一个 submit 按钮（文案随模式切换）
  await page.locator('button[type="submit"]').click();
  // 等待注册结果（成功则会话建立并跳离登录页，失败则停留）
  await page.waitForURL((u) => u.pathname !== "/login", { timeout: 10000 }).catch(
    () => {},
  );

  // 无论注册后是否自动登录，统一重新登录以确保会话稳定
  await login(page, { username, password });

  return { username, password, email };
}
