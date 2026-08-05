import { test } from "@playwright/test";

test("verify fixes: aimall guest, register route, notifications guest", async ({ page }) => {
  const aimallErrs: string[] = [];
  page.on("pageerror", (e) => aimallErrs.push(e.message));

  // 1) /register 现在应渲染注册页（不再 404）
  await page.goto("/register");
  await page.waitForTimeout(1500);
  const regBody = (await page.locator("body").innerText()).slice(0, 80);
  const regHasForm = (await page.locator("input").count()) > 0;
  console.log(`[/register] url=${page.url()} body="${regBody}" inputs=${await page.locator("input").count()} hasForm=${regHasForm}`);

  // 2) /auth/register 同样
  await page.goto("/auth/register");
  await page.waitForTimeout(1200);
  console.log(`[/auth/register] url=${page.url()} inputs=${await page.locator("input").count()}`);

  // 3) AIMall 游客不应崩溃
  await page.goto("/ai-mall");
  await page.waitForTimeout(3000);
  const aimallBody = (await page.locator("body").innerText()).slice(0, 120);
  const hasLoginBtn = await page.getByRole("button", { name: /登录|sign in/i }).count();
  console.log(`[/ai-mall 游客] pageErrors=${aimallErrs.length} hasLoginGuide=${hasLoginBtn} body="${aimallBody}"`);

  // 4) 通知中心游客：不应弹 Field required，应空态或引导
  const notifErrs: string[] = [];
  page.on("pageerror", (e) => notifErrs.push(e.message));
  await page.goto("/notifications");
  await page.waitForTimeout(2000);
  const notifBody = (await page.locator("body").innerText()).slice(0, 120);
  const fieldRequired = (await page.locator("body").innerText()).includes("Field required");
  console.log(`[/notifications 游客] body="${notifBody}" fieldRequiredShown=${fieldRequired} pageErrors=${notifErrs.length}`);

  console.log("\n=== AIMALL PAGE ERRORS ===", aimallErrs.join(" | ") || "(none)");
});
