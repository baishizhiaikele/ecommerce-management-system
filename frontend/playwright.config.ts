import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 配置（P2 体验增强）：前端经 Vite 代理把 /api 转发到本地后端。
 * webServer 自动拉起后端（uvicorn，独立测试库）与前端（vite dev）。
 * 运行：npm run e2e  （首次需 npx playwright install chromium）
 */
export default defineConfig({
  testDir: "./e2e",
  // 调试探针（下划线前缀）不进入全量套件
  testIgnore: /_probe\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // SQLite 测试库不支持高并发，串行执行避免锁竞争导致的偶发超时
  workers: process.env.CI ? 2 : 1,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command:
        "cd ../backend && set EVENT_URL=sqlite+aiosqlite:///./test_e2e.db && python -m uvicorn app.main:app --port 8000 --log-level warning",
      url: "http://localhost:8000/api/health",
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev",
      url: "http://localhost:5173",
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
