import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider } from "antd";
import App from "./App";
import { theme } from "./theme";
import ErrorBoundary from "./components/ErrorBoundary";
import { LanguageProvider } from "./i18n";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider theme={theme}>
      <BrowserRouter>
        <LanguageProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </LanguageProvider>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);

// 注册 Service Worker（PWA 离线支持）。
// 开发模式下不注册，且主动注销已存在的 SW：否则 SW 的 cache-first 会覆盖 Vite 的 HMR，
// 导致改了代码页面却仍加载旧模块（表现为“修了反复还是报错”）。
if ("serviceWorker" in navigator) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((regs) =>
      regs.forEach((r) => r.unregister())
    );
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}
