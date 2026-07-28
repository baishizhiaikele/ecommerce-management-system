import { describe, it, expect } from "vitest";
import { proxyImg, liveWsUrl } from "../../api";

describe("proxyImg", () => {
  it("外部 http 图片经本地代理转发", () => {
    expect(proxyImg("https://picsum.photos/1")).toBe(
      "/api/images/proxy?u=" + encodeURIComponent("https://picsum.photos/1"),
    );
  });
  it("本地 /uploads 路径原样返回", () => {
    expect(proxyImg("/uploads/x.png")).toBe("/uploads/x.png");
  });
  it("空字符串原样返回", () => {
    expect(proxyImg("")).toBe("");
  });
});

describe("liveWsUrl", () => {
  it("同源下生成 ws 路径", () => {
    const url = liveWsUrl("room123");
    expect(url).toMatch(/^ws:\/\/localhost(?::\d+)?\/api\/live\/room123\/ws/);
  });
});
