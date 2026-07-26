import "axios";

// S4/L7：为 axios 请求配置增加自定义字段，避免拦截器中使用 `as any`
declare module "axios" {
  export interface AxiosRequestConfig {
    /** 标记该请求在 401 时不应触发整页跳转登录（如 /auth/me 初始化拉取） */
    _noAuthRedirect?: boolean;
    /** 标记该请求已尝试过令牌刷新，避免 401 刷新死循环 */
    _retry?: boolean;
  }
}
