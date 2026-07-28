import { Empty } from "antd";
import { translate } from "../i18n";

interface Props {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ title = translate("common.noData"), description, action }: Props) {
  return (
    <div className="text-center py-10">
      <Empty description={title} />
      {description && <p className="text-slate-400 mt-1">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
