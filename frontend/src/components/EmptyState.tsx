import { Empty } from "antd";
import { translate } from "../i18n";

interface Props {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  /** 自定义插图，不传则用 antd 默认空态图 */
  image?: React.ReactNode;
}

export default function EmptyState({
  title = translate("common.noData"),
  description,
  action,
  image,
}: Props) {
  return (
    <div className="text-center py-10" role="status">
      <Empty
        image={image ?? Empty.PRESENTED_IMAGE_SIMPLE}
        description={<span className="text-slate-600">{title}</span>}
      />
      {/* 空态只说"没有"没用，描述里要告诉用户下一步能做什么 */}
      {description && (
        <p className="text-slate-400 mt-1 mx-auto max-w-md text-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
