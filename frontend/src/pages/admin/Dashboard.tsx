import { useEffect, useState } from "react";
import { Row, Col, Card, Statistic, Spin } from "antd";
import {
  UserOutlined,
  ShopOutlined,
  AppstoreOutlined,
  FileProtectOutlined,
  ShoppingOutlined,
  AccountBookOutlined,
  FrownOutlined,
} from "@ant-design/icons";
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
  if (loading || !stats)
    return (
      <div className="text-center py-20">
        <Spin />
      </div>
    );

  const cards = [
    { title: "用户数", value: stats.user_count, icon: <UserOutlined />, color: "#6366F1" },
    { title: "商家数", value: stats.merchant_count, icon: <ShopOutlined />, color: "#22D3EE" },
    { title: "商品数", value: stats.product_count, icon: <AppstoreOutlined />, color: "#818CF8" },
    { title: "待审核商品", value: stats.pending_product_count, icon: <FileProtectOutlined />, color: "#F59E0B" },
    { title: "订单数", value: stats.order_count, icon: <ShoppingOutlined />, color: "#10B981" },
    { title: "平台 GMV", value: `¥${money(stats.total_gmv)}`, icon: <AccountBookOutlined />, color: "#6366F1" },
    { title: "负面评价", value: stats.negative_review_count, icon: <FrownOutlined />, color: "#EF4444" },
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-6 rounded bg-[#6366F1]" />
        <h2 className="text-xl font-bold m-0">平台仪表板</h2>
      </div>
      <Row gutter={[16, 16]}>
        {cards.map((c, i) => (
          <Col key={c.title} xs={12} md={8} lg={6}>
            <Card className="soft-card fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-center justify-between">
                <Statistic
                  title={c.title}
                  value={c.value}
                  valueStyle={{ color: c.color, fontWeight: 600 }}
                />
                <div className="stat-icon" style={{ background: `${c.color}1A`, color: c.color }}>
                  {c.icon}
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <Card title="近 7 天销售趋势" className="mt-6 soft-card fade-up">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trend.map((t) => ({ date: t.date, 金额: Number(t.amount) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F7" />
            <XAxis dataKey="date" stroke="#94A3B8" />
            <YAxis stroke="#94A3B8" />
            <Tooltip />
            <Line type="monotone" dataKey="金额" stroke="#6366F1" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
