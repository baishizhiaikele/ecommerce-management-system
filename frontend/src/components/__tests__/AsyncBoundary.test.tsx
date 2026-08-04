/**
 * C1-前端单测：AsyncBoundary 异步三态边界组件。
 *
 * 验证 loading / error / empty / children 四态正确渲染，
 * 确保错误态绝不会显示成"暂无数据"（用户能分清"真没有"和"没加载出来"）。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AsyncBoundary from "../AsyncBoundary";

describe("AsyncBoundary", () => {
  it("loading 态渲染默认骨架屏，不渲染 children", () => {
    render(
      <AsyncBoundary loading={true} error={null}>
        <div>内容</div>
      </AsyncBoundary>
    );
    // antd Skeleton 渲染
    expect(document.querySelector(".ant-skeleton")).toBeTruthy();
    // 不渲染 children（loading 时 children 不可见）
    expect(screen.queryByText("内容")).toBeNull();
    // 不渲染错误态
    expect(screen.queryByText("加载失败")).toBeNull();
  });

  it("loading 态渲染自定义骨架", () => {
    render(
      <AsyncBoundary loading={true} error={null} skeleton={<span>自定义加载中</span>}>
        <div>内容</div>
      </AsyncBoundary>
    );
    expect(screen.getByText("自定义加载中")).toBeInTheDocument();
    expect(screen.queryByText("内容")).toBeNull();
  });

  it("error 态显示错误信息和重试按钮", () => {
    const retry = vi.fn();
    render(
      <AsyncBoundary loading={false} error="网络连接失败" retry={retry}>
        <div>内容</div>
      </AsyncBoundary>
    );
    // 显示错误描述
    expect(screen.getByText("网络连接失败")).toBeInTheDocument();
    // 显示重试按钮
    expect(screen.getByText("重试")).toBeInTheDocument();
    // 不渲染子内容
    expect(screen.queryByText("内容")).toBeNull();
  });

  it("error 态不传 retry 时不显示重试按钮", () => {
    render(
      <AsyncBoundary loading={false} error="出错了">
        <div>内容</div>
      </AsyncBoundary>
    );
    expect(screen.getByText("出错了")).toBeInTheDocument();
    expect(screen.queryByText("重试")).toBeNull();
  });

  it("error 态重试按钮可点击", async () => {
    const retry = vi.fn();
    render(
      <AsyncBoundary loading={false} error="出错了" retry={retry}>
        <div>内容</div>
      </AsyncBoundary>
    );
    await userEvent.click(screen.getByText("重试"));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("empty 态显示空态组件", () => {
    render(
      <AsyncBoundary
        loading={false}
        error={null}
        isEmpty={true}
        emptyTitle="暂无订单"
        emptyDescription="快去下单吧"
      >
        <div>内容</div>
      </AsyncBoundary>
    );
    expect(screen.getByText("暂无订单")).toBeInTheDocument();
    expect(screen.getByText("快去下单吧")).toBeInTheDocument();
    expect(screen.queryByText("内容")).toBeNull();
  });

  it("正常态渲染 children", () => {
    render(
      <AsyncBoundary loading={false} error={null}>
        <div>正常内容</div>
      </AsyncBoundary>
    );
    expect(screen.getByText("正常内容")).toBeInTheDocument();
  });

  it("loading 优先于 error（不显示错误信息）", () => {
    // 同时 loading=true 和 error 存在时，应优先显示 loading 骨架
    render(
      <AsyncBoundary loading={true} error="加载失败">
        <div>内容</div>
      </AsyncBoundary>
    );
    // 应显示骨架而非错误
    expect(screen.queryByText("加载失败")).toBeNull();
  });

  it("error 优先于 children", () => {
    render(
      <AsyncBoundary loading={false} error="出错了">
        <div>正常内容</div>
      </AsyncBoundary>
    );
    expect(screen.getByText("出错了")).toBeInTheDocument();
    expect(screen.queryByText("正常内容")).toBeNull();
  });

  it("isEmpty 时不渲染 error（empty 不替代 error）", () => {
    // 有 error 时 isEmpty 不生效
    render(
      <AsyncBoundary
        loading={false}
        error="网络错误"
        isEmpty={true}
        emptyTitle="空数据"
      >
        <div>内容</div>
      </AsyncBoundary>
    );
    expect(screen.getByText("网络错误")).toBeInTheDocument();
    expect(screen.queryByText("空数据")).toBeNull();
  });
});
