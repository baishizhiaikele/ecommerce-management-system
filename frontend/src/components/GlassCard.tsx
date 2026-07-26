import { Card } from "antd";
import type { CardProps } from "antd";

/** 玻璃拟态卡片封装 */
export default function GlassCard(props: CardProps) {
  return <Card {...props} className={`glass ${props.className || ""}`} bordered={false} />;
}
