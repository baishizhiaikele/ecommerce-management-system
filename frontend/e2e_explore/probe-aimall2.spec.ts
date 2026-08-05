import { test } from "@playwright/test";

test("probe real ai-home-arrange endpoint", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);
  const endpoints = [
    ["/api/ai/home-arrange", "with /api prefix"],
    ["/ai/home-arrange", "no prefix"],
  ];
  for (const [url, note] of endpoints) {
    const r = await page.evaluate(async (u) => {
      try {
        const res = await fetch(u);
        const txt = await res.text();
        return { status: res.status, body: txt.slice(0, 500) };
      } catch (e: any) { return { status: "ERR", body: String(e) }; }
    }, url);
    console.log(`\n${note} ${url} =>`, JSON.stringify(r));
  }

  // 进 ai-mall 看 data 真实结构（崩溃时）
  await page.goto("/ai-mall");
  await page.waitForTimeout(3000);
  const dbg = await page.evaluate(() => {
    const txt = (document.body.innerText || "").slice(0, 200);
    return txt;
  });
  console.log("\nai-mall body text:", dbg);
});
