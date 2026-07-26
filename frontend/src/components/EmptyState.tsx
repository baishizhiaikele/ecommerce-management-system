import { Empty } from "antd";
import { ReactNode } from "react";

export default function EmptyState({
  title = "暂无数据",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14">
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <div className="text-slate-400">
            <div className="font-medium text-slate-500">{title}</div>
            {description && <div className="text-sm mt-1 max-w-xs mx-auto">{description}</div>}
          </div>
        }
      >
        {action}
      </Empty>
    </div>
  );
}
