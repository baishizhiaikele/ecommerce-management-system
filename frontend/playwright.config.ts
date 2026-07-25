import { defineConfig, devices } from "@playwright/test";

// 端到端冒烟测试：
// 后端以 SQLite 临时库启动，并通过 APP_STATIC_DIR 同源托管已构建的前端（frontend/dist），
// 浏览器直接访问后端地址即可完成「前端 + API」整链路验证，无需额外静态站点。
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8000",
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command:
      'cd /d %CD%\\..\\backend && set "APP_STATIC_DIR=%CD%\\..\\frontend\\dist" && set "DATABASE_URL=sqlite+aiosqlite:///./e2e_test.db" && python -m uvicorn app.main:app --port 8000',
    url: "http://localhost:8000/api/health",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
