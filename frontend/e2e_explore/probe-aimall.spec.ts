import { test } from "@playwright/test";

test("probe aimall crash stack + product1 http", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push((e.stack || e.message).split("\n").slice(0, 8).join("\n")));

  await page.goto("/ai-mall");
  await page.waitForTimeout(3000);
  console.log("=== AIMALL PAGE ERRORS (full stack) ===");
  console.log(errs.join("\n----\n") || "(none)");

  // 探测商品详情1的真实 HTTP 响应
  const resp = await page.evaluate(async () => {
    try {
      const r = await fetch("/api/products/1");
      const txt = await r.text();
      return { status: r.status, body: txt.slice(0, 300) };
    } catch (e: any) {
      return { status: "FETCH_ERR", body: String(e) };
    }
  });
  console.log("\n=== /api/products/1 ===");
  console.log(JSON.stringify(resp));

  // 探测 homeArrange 接口游客响应
  const arrange = await page.evaluate(async () => {
    try {
      const r = await fetch("/api/home/arrange");
      const txt = await r.text();
      return { status: r.status, body: txt.slice(0, 400) };
    } catch (e: any) {
      return { status: "FETCH_ERR", body: String(e) };
    }
  });
  console.log("\n=== /api/home/arrange ===");
  console.log(JSON.stringify(arrange));
});
