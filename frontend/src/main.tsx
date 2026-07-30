import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import App from "./App";
import { theme } from "./theme";
import ErrorBoundary from "./components/ErrorBoundary";
import { LanguageProvider, useI18n } from "./i18n";
import "./index.css";

/** 根据当前语言切换 antd 内置文案（取消/确定/分页等），避免中文界面显示英文 "cancel"。 */
function AntdLocaleBridge({ children }: { children: React.ReactNode }) {
  const { lang } = useI18n();
  return (
    <ConfigProvider theme={theme} locale={lang === "en" ? enUS : zhCN}>
      {children}
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AntdLocaleBridge>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AntdLocaleBridge>
      </LanguageProvider>
    </BrowserRouter>
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
