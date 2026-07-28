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
import { useI18n } from "../../i18n";

export default function MerchantDashboard() {
  const { t } = useI18n();
  const [stats, setStats] = useState<MerchantStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [analytics, setAnalytics] = useState<MerchantAnalytics | null>(null);
  const [days, setDays] = useState<number>(7);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    Promise.all([merchantStats(), merchantTrend(days), merchantAnalytics()])
      .then(([s, tr, a]) => {
        setStats(s);
        setTrend(tr);
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
    { title: t("md.productTotal"), value: stats.product_count, icon: <AppstoreOutlined />, color: "#4F46E5" },
    { title: t("md.activeProducts"), value: stats.active_product_count, icon: <CheckCircleOutlined />, color: "#10B981" },
    { title: t("md.orderCount"), value: stats.order_count, icon: <ShoppingOutlined />, color: "#4F46E5" },
    { title: t("md.paidOrders"), value: stats.paid_order_count, icon: <CreditCardOutlined />, color: "#4F46E5" },
    { title: t("md.totalSales"), value: `¥${money(stats.total_sales)}`, icon: <AccountBookOutlined />, color: "#4F46E5" },
    { title: t("md.pendingReview"), value: stats.pending_review_count, icon: <StarOutlined />, color: "#F59E0B" },
    { title: t("md.lowStock"), value: stats.low_stock_count, icon: <AlertOutlined />, color: "#EF4444" },
  ];

  const onExport = async () => {
    try {
      await exportOrdersReport();
      message.success(t("md.exported"));
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("md.exportFail"));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-1 h-6 rounded bg-slate-300" />
          <h2 className="text-xl font-bold m-0">{t("md.title")}</h2>
        </div>
        <Button type="primary" icon={<DownloadOutlined />} onClick={onExport}>
          {t("md.exportReport")}
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
        title={t("md.salesTrend", { days })}
        className="mt-6 soft-card fade-up"
        extra={
          <Segmented
            value={days}
            onChange={(v) => setDays(v as number)}
            options={[
              { label: t("md.days7"), value: 7 },
              { label: t("md.days30"), value: 30 },
              { label: t("md.days90"), value: 90 },
            ]}
          />
        }
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trend.map((tr) => ({ date: tr.date, amount: Number(tr.amount) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F7" />
            <XAxis dataKey="date" stroke="#94A3B8" />
            <YAxis stroke="#94A3B8" />
            <Tooltip />
            <Line type="monotone" dataKey="amount" name={t("common.amount")} stroke="#4F46E5" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {analytics && (
        <Card title={t("md.rfm")} className="mt-6 soft-card fade-up">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Statistic
                title={t("md.repurchaseRate")}
                value={(analytics.repurchase_rate * 100).toFixed(1)}
                suffix="%"
                valueStyle={{ color: "#4F46E5", fontWeight: 600 }}
              />
              <div className="text-slate-500 text-sm mt-2">
                {t("md.buyersDesc", { n: analytics.buyers })}
              </div>
            </Col>
            <Col xs={24} md={16}>
              <List
                dataSource={analytics.rfm}
                renderItem={(s) => (
                  <List.Item>
                    <List.Item.Meta
                      title={s.segment}
                      description={`${t("md.rfmCustomer")} ${s.customers} · ${t("md.rfmSpend")} ¥${money(s.total_monetary)}`}
                    />
                  </List.Item>
                )}
              />
            </Col>
          </Row>
        </Card>
      )}

      <Card title={t("md.aovTrend")} className="mt-6 soft-card fade-up">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={trend.map((tr) => {
              const orders = tr.orders ?? 0;
              return {
                date: tr.date,
                aov: orders > 0 ? Number((Number(tr.amount) / orders).toFixed(2)) : 0,
              };
            })}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F7" />
            <XAxis dataKey="date" stroke="#94A3B8" />
            <YAxis stroke="#94A3B8" />
            <Tooltip />
            <Line type="monotone" dataKey="aov" name={t("md.aov")} stroke="#10B981" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
