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
import { adminStats, adminTrend, AdminStats, TrendPoint } from "../../api";
import { money } from "../../utils/format";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([adminStats(), adminTrend(7)])
      .then(([s, t]) => {
        setStats(s);
        setTrend(t);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading || !stats) return <div className="text-center py-20"><Spin /></div>;

  const cards = [
    { title: "用户数", value: stats.user_count },
    { title: "商家数", value: stats.merchant_count },
    { title: "商品数", value: stats.product_count },
    { title: "待审核商品", value: stats.pending_product_count },
    { title: "订单数", value: stats.order_count },
    { title: "平台 GMV", value: `¥${money(stats.total_gmv)}` },
    { title: "负面评价", value: stats.negative_review_count },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">平台仪表板</h2>
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
            <Line type="monotone" dataKey="金额" stroke="#06B6D4" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
