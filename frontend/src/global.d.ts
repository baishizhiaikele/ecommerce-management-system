// L3：将后端统一错误结构 ApiError 提升为全局类型别名，
// 使各处的 `AxiosError<ApiError>` 无需逐文件重复 import，统一收敛错误类型。
declare global {
  type ApiError = import("./api").ApiError;
}

export {};
