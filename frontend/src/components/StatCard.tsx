import type { ReactNode } from "react";
import { Card, Skeleton, Typography } from "antd";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import CountUp from "./CountUp";

const { Text } = Typography;

interface Props {
  title: string;
  /** 数值（用于滚动递增） */
  value: number;
  /** 数值格式化，默认千分位取整 */
  format?: (n: number) => string;
  icon?: ReactNode;
  accent?: string;
  delta?: number;
  deltaLabel?: string;
  loading?: boolean;
  spark?: number[];
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return null;
  const w = 132;
  const h = 36;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d - min) / range) * (h - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg className="spark-track" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={area} fill={color} opacity={0.12} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 科技感统计卡：发光图标 + 大数值（滚动递增）+ 环比 + 迷你 sparkline */
export default function StatCard({
  title,
  value,
  format,
  icon,
  accent = "#4F46E5",
  delta,
  deltaLabel,
  loading,
  spark,
}: Props) {
  const up = (delta ?? 0) >= 0;
  return (
    <Card className="chart-card" styles={{ body: { padding: 20 } }} bordered={false}>
      <div className="flex items-start justify-between">
        <div style={{ color: "#64748b", fontSize: 13 }}>{title}</div>
        {icon && (
          <div className="glow-icon" style={{ width: 40, height: 40, fontSize: 19 }}>
            {icon}
          </div>
        )}
      </div>
      {loading ? (
        <Skeleton active paragraph={false} title={{ width: "60%" }} style={{ marginTop: 10 }} />
      ) : (
        <>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: "-0.5px",
              marginTop: 8,
            }}
          >
            <span className="count-pop">
              <CountUp value={value} format={format} />
            </span>
          </div>
          {delta !== undefined && (
            <div className="flex items-center gap-1" style={{ marginTop: 6 }}>
              <span
                className="flex items-center gap-0.5"
                style={{ color: up ? "#10b981" : "#ef4444", fontWeight: 600, fontSize: 13 }}
              >
                {up ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                {(up ? "+" : "") + (delta * 100).toFixed(1)}%
              </span>
              {deltaLabel && <Text type="secondary" style={{ fontSize: 12 }}>{deltaLabel}</Text>}
            </div>
          )}
          <div style={{ marginTop: 10, opacity: 0.9 }}>
            <Sparkline data={spark || []} color={accent.includes("#") ? "#4F46E5" : "#4F46E5"} />
          </div>
        </>
      )}
    </Card>
  );
}
