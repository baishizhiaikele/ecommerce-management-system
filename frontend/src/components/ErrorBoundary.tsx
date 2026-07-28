import { Component, type ReactNode } from "react";
import { getLang } from "../i18n";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

// S6：捕获渲染期异常，避免单点错误导致整页白屏
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.hasError) {
      const zh = getLang() === "zh";
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
            <h1 className="text-xl font-bold text-slate-800 mb-2">
              {zh ? "页面出现了一点问题" : "Something went wrong"}
            </h1>
            <p className="text-slate-500 text-sm mb-6">
              {this.state.message || (zh ? "请刷新页面后重试" : "Please refresh and try again")}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-[#4F46E5] text-white text-sm font-medium"
            >
              {zh ? "刷新页面" : "Refresh"}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
