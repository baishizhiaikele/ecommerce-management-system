import { useEffect, useState } from "react";
import { Row, Col, Card, Statistic, Spin } from "antd";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { merchantStats, merchantTrend, MerchantStats, TrendPoint } from "../../api";
import { money } from "../../utils/format";

export default function MerchantDashboard() {
  const [stats, setStats] = useState<MerchantStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([merchantStats(), merchantTrend(7)])
      .then(([s, t]) => {
        setStats(s);
        setTrend(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading || !stats) return <div className="text-center py-20"><Spin /></div>;

  const cards = [
    { title: "商品总数", value: stats.product_count },
    { title: "已上架", value: stats.active_product_count },
    { title: "订单数", value: stats.order_count },
    { title: "已付款订单", value: stats.paid_order_count },
    { title: "总销售额", value: `¥${money(stats.total_sales)}` },
    { title: "待评价", value: stats.pending_review_count },
    { title: "低库存(<10)", value: stats.low_stock_count },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">数据看板</h2>
      <Row gutter={[16, 16]}>
        {cards.map((c) => (
          <Col key={c.title} xs={12} md={8} lg={6}>
            <Card>
              <Statistic title={c.title} value={c.value} />
            </Card>
          </Col>
        ))}
      </Row>
      <Card title="近 7 天销售趋势" className="mt-6">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trend.map((t) => ({ date: t.date, 金额: Number(t.amount) }))}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="金额" stroke="#4F46E5" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
