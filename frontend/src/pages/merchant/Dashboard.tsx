import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { Row, Col, Card, Statistic, Spin, Button, message, Segmented, List } from "antd";
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ShoppingOutlined,
  CreditCardOutlined,
  AccountBookOutlined,
  StarOutlined,
  AlertOutlined,
  DownloadOutlined,
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
import {
  merchantStats,
  merchantTrend,
  merchantAnalytics,
  exportOrdersReport,
  MerchantStats,
  TrendPoint,
  MerchantAnalytics,
} from "../../api";
import { money } from "../../utils/format";

export default function MerchantDashboard() {
  const [stats, setStats] = useState<MerchantStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [analytics, setAnalytics] = useState<MerchantAnalytics | null>(null);
  const [days, setDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    Promise.all([merchantStats(), merchantTrend(days), merchantAnalytics()])
      .then(([s, t, a]) => {
        setStats(s);
        setTrend(t);
        setAnalytics(a);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);
  if (loading || !stats)
    return (
      <div className="text-center py-20">
        <Spin />
      </div>
    );

  const cards = [
    { title: "商品总数", value: stats.product_count, icon: <AppstoreOutlined />, color: "#4F46E5" },
    { title: "已上架", value: stats.active_product_count, icon: <CheckCircleOutlined />, color: "#10B981" },
    { title: "订单数", value: stats.order_count, icon: <ShoppingOutlined />, color: "#4F46E5" },
    { title: "已付款订单", value: stats.paid_order_count, icon: <CreditCardOutlined />, color: "#4F46E5" },
    { title: "总销售额", value: `¥${money(stats.total_sales)}`, icon: <AccountBookOutlined />, color: "#4F46E5" },
    { title: "待评价", value: stats.pending_review_count, icon: <StarOutlined />, color: "#F59E0B" },
    { title: "低库存(<10)", value: stats.low_stock_count, icon: <AlertOutlined />, color: "#EF4444" },
  ];

  const onExport = async () => {
    try {
      await exportOrdersReport();
      message.success("报表已导出");
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "导出失败");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-1 h-6 rounded bg-slate-300" />
          <h2 className="text-xl font-bold m-0">数据看板</h2>
        </div>
        <Button type="primary" icon={<DownloadOutlined />} onClick={onExport}>
          导出订单报表
        </Button>
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
      <Card
        title={`近 ${days} 天销售趋势`}
        className="mt-6 soft-card fade-up"
        extra={
          <Segmented
            value={days}
            onChange={(v) => setDays(v as number)}
            options={[
              { label: "7 天", value: 7 },
              { label: "30 天", value: 30 },
              { label: "90 天", value: 90 },
            ]}
          />
        }
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trend.map((t) => ({ date: t.date, 金额: Number(t.amount) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F7" />
            <XAxis dataKey="date" stroke="#94A3B8" />
            <YAxis stroke="#94A3B8" />
            <Tooltip />
            <Line type="monotone" dataKey="金额" stroke="#4F46E5" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {analytics && (
        <Card title="客户分层（RFM）与复购" className="mt-6 soft-card fade-up">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Statistic
                title="复购率"
                value={(analytics.repurchase_rate * 100).toFixed(1)}
                suffix="%"
                valueStyle={{ color: "#4F46E5", fontWeight: 600 }}
              />
              <div className="text-slate-500 text-sm mt-2">
                下单≥2 次的买家占比，共 {analytics.buyers} 位成交客户
              </div>
            </Col>
            <Col xs={24} md={16}>
              <List
                dataSource={analytics.rfm}
                renderItem={(s) => (
                  <List.Item>
                    <List.Item.Meta
                      title={s.segment}
                      description={`客户 ${s.customers} 人 · 累计消费 ¥${money(s.total_monetary)}`}
                    />
                  </List.Item>
                )}
              />
            </Col>
          </Row>
        </Card>
      )}

      <Card title="客单价（AOV）趋势" className="mt-6 soft-card fade-up">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={trend.map((t) => ({
              date: t.date,
              客单价: t.orders > 0 ? Number((Number(t.amount) / t.orders).toFixed(2)) : 0,
            }))}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F7" />
            <XAxis dataKey="date" stroke="#94A3B8" />
            <YAxis stroke="#94A3B8" />
            <Tooltip />
            <Line type="monotone" dataKey="客单价" stroke="#10B981" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
