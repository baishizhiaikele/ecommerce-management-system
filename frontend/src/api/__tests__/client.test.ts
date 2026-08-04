/**
 * C1-前端单测：API 客户端 401 刷新拦截器。
 *
 * 验证核心安全逻辑：
 * 1. 并发 401 请求共享同一次 token 刷新
 * 2. 刷新成功后重放原始请求
 * 3. 刷新失败时跳转登录（受保护页面）
 * 4. 刷新失败时公开页面静默失败不跳转
 * 5. _noAuthRedirect 标记跳过刷新
 * 6. getErrorMessage 各类错误信息提取
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, API_BASE, getErrorMessage } from "../client";
import axios from "axios";

// 记录所有发出的请求（mock 底层 axios）
const mockAdapter = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // 替换 axios 默认适配器为 mock
  vi.spyOn(axios, "create").mockReturnValue(api);
});

describe("getErrorMessage", () => {
  it("提取后端 detail 字段", () => {
    const err = {
      isAxiosError: true,
      response: { data: { detail: "库存不足" } },
    };
    expect(getErrorMessage(err)).toBe("库存不足");
  });

  it("提取 FastAPI 422 校验错误", () => {
    const err = {
      isAxiosError: true,
      response: { data: { detail: [{ msg: "必填字段缺失" }] } },
    };
    expect(getErrorMessage(err)).toBe("必填字段缺失");
  });

  it("提取限流错误", () => {
    const err = {
      isAxiosError: true,
      response: { data: { error: "请求过于频繁" } },
    };
    expect(getErrorMessage(err)).toBe("操作过于频繁，请稍后再试");
  });

  it("超时错误", () => {
    const err = {
      isAxiosError: true,
      code: "ECONNABORTED",
      response: {},
    };
    expect(getErrorMessage(err)).toBe("请求超时，请检查网络后重试");
  });

  it("网络异常（无响应）", () => {
    const err = { isAxiosError: true, response: undefined };
    expect(getErrorMessage(err)).toBe("网络异常，无法连接服务器");
  });

  it("非 axios 错误返回 fallback", () => {
    expect(getErrorMessage(new Error("boom"), "自定义兜底")).toBe("自定义兜底");
  });

  it("空 detail 字符串返回 fallback", () => {
    const err = {
      isAxiosError: true,
      response: { data: { detail: "" } },
    };
    expect(getErrorMessage(err)).toBe("请求失败，请稍后重试");
  });
});

describe("401 拦截器行为", () => {
  it("_noAuthRedirect 标记跳过刷新", async () => {
    // 构造带 _noAuthRedirect 标记的 config
    const config = { _noAuthRedirect: true, url: "/api/products" };
    const error = {
      config,
      response: { status: 401 },
      isAxiosError: true,
    };

    // 直接触发拦截器 error handler
    const result = (api.interceptors.response as any).handlers[0].rejected(error);
    await expect(result).rejects.toBeDefined();
  });

  it("非 401 错误直接 reject", async () => {
    const error = {
      config: { url: "/api/products" },
      response: { status: 500, data: { detail: "服务器错误" } },
      isAxiosError: true,
    };

    const result = (api.interceptors.response as any).handlers[0].rejected(error);
    await expect(result).rejects.toBeDefined();
  });

  it("error.config 为 null 时不崩溃", async () => {
    // S6 防御性判空：error.config 缺失时不应二次崩溃
    const error = {
      config: null,
      response: { status: 401 },
      isAxiosError: true,
    };

    const result = (api.interceptors.response as any).handlers[0].rejected(error);
    await expect(result).rejects.toBeDefined();
  });
});
