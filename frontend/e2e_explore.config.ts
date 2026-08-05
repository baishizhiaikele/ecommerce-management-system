import { defineConfig } from "@playwright/test";

// 真实体验探针：自动拉起前端 dev server（后端 8000 已在环境内常驻），
// 用真实浏览器走核心流程，dump 页面内 console error、未捕获异常、卡点与真实 DOM。
export default defineConfig({
  testDir: "./e2e_explore",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    trace: "on",
  },
  webServer: {
    command: "D:\\computer\\npx.cmd vite --port 5173 --host 127.0.0.1",
    url: "http://127.0.0.1:5173/",
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
