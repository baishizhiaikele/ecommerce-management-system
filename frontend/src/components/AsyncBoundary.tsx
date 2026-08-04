import React from "react";
import { Button, Result, Skeleton } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import EmptyState from "./EmptyState";
import { translate } from "../i18n";

interface Props {
  loading: boolean;
  error: string | null;
  retry?: () => void;
  /** 判定为"真空态"时渲染空态引导；不传则不做空态判定 */
  isEmpty?: boolean;
  /** 空态标题 / 描述 / 引导按钮 */
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** 错误态下额外的兜底操作（如"返回首页"） */
  errorAction?: React.ReactNode;
  /** 自定义骨架，默认为 3 行段落骨架 */
  skeleton?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 异步三态渲染边界：loading（骨架屏）/ error（明确报错 + 重试）/ empty（空态引导）。
 *
 * 关键点：错误态绝不能渲染成"暂无数据"，用户必须能分清"真没有"和"没加载出来"。
 */
export default function AsyncBoundary({
  loading,
  error,
  retry,
  isEmpty,
  emptyTitle,
  emptyDescription,
  emptyAction,
  errorAction,
  skeleton,
  children,
}: Props) {
  if (loading) {
    return (
      // aria-busy + 可读文案：读屏用户能感知"正在加载"，而不是面对一片静默
      <div role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">{translate("common.loading")}</span>
        {skeleton ?? <Skeleton active paragraph={{ rows: 4 }} className="py-6" />}
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert">
        <Result
          status="warning"
          title={translate("state.errorTitle")}
          subTitle={error || translate("state.errorDesc")}
          extra={
            <div className="flex items-center justify-center gap-2">
              {retry && (
                <Button type="primary" icon={<ReloadOutlined />} onClick={retry}>
                  {translate("common.retry")}
                </Button>
              )}
              {errorAction}
            </div>
          }
        />
      </div>
    );
  }
  if (isEmpty) {
    return (
      <EmptyState
        title={emptyTitle ?? translate("common.noData")}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }
  return <>{children}</>;
}
