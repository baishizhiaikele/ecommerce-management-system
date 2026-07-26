import type { ReactNode } from "react";
import { Typography } from "antd";

const { Title } = Typography;

interface Props {
  icon?: ReactNode;
  accent?: string;
  title: string;
  subtitle?: string;
  extra?: ReactNode;
}

/** 统一页面标题区：发光图标徽章 + 强标题 + 副标题 + 右侧操作 */
export default function PageHeader({ icon, accent, title, subtitle, extra }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-5 fade-up">
      <div className="flex items-center gap-4">
        {icon && (
          <div
            className="glow-icon"
            style={{
              width: 52,
              height: 52,
              fontSize: 24,
            }}
          >
            {icon}
          </div>
        )}
        <div>
          <Title level={3} style={{ margin: 0, fontWeight: 700, letterSpacing: "-0.4px" }}>
            {title}
          </Title>
          {subtitle && (
            <div style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}>{subtitle}</div>
          )}
        </div>
      </div>
      {extra && <div className="flex items-center gap-2 flex-wrap">{extra}</div>}
    </div>
  );
}
