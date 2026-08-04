import { Component, ReactNode } from "react";
import { translate } from "../i18n";

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 全局错误边界：捕获渲染期错误与懒加载 chunk 加载失败。
 * 没有它时，任意一个懒加载页面（路由组件）的 chunk 加载失败会抛错，
 * Suspense 只处理「加载中」、不处理「加载失败」，导致整页卡在无限 Spinner 或白屏。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-slate-700 text-base font-medium">
            {translate("errorBoundary.title")}
          </div>
          <div className="text-slate-400 text-sm max-w-md break-words">
            {error.message || translate("errorBoundary.unknown")}
          </div>
          <button
            onClick={this.reset}
            className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            {translate("common.retry")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
