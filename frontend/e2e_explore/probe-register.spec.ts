import { test } from "@playwright/test";

test("probe register page real state", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(e.message + " || " + (e.stack || "").split("\n").slice(0,3).join(" / ")));

  await page.goto("/register");
  await page.waitForTimeout(3000);
  const url = page.url();
  const body = (await page.locator("body").innerText().catch(() => ""));
  const placeholders = await page.locator("input,textarea").evaluateAll(
    (els) => els.map((e) => e.placeholder || e.getAttribute("aria-label") || e.getAttribute("name") || "?")
  );
  console.log(`\n[REGISTER] url=${url}`);
  console.log(`bodyText(first 500)=\n${body.slice(0, 500)}`);
  console.log(`inputPlaceholders=${JSON.stringify(placeholders)}`);
  console.log(`\nCONSOLE ERRORS:\n${consoleErrors.slice(0, 20).join("\n") || "(none)"}`);
  console.log(`\nPAGE ERRORS:\n${pageErrors.slice(0, 10).join("\n---\n") || "(none)"}`);
});
