import { useEffect, useState } from "react";
import { Row, Col, Card, Spin } from "antd";
import { Users, ShoppingBag, Coins, Package, TrendingUp } from "lucide-react";
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";
import {
  adminStats,
  adminTrend,
  adminDashboardAnalytics,
  AdminStats,
  TrendPoint,
  DashboardAnalytics,
} from "../../api";
import { money } from "../../utils/format";
import { reportError } from "../../utils/reportError";
import StatCard from "../../components/StatCard";
import PageHeader from "../../components/PageHeader";
import Reveal from "../../components/Reveal";
import { useI18n } from "../../i18n";

// 简约单色透明度阶梯（统一品牌色，避免多色花哨）
const PIE_COLORS = [
  "#4F46E5",
  "rgba(79,70,229,0.78)",
  "rgba(79,70,229,0.58)",
  "rgba(79,70,229,0.40)",
  "rgba(79,70,229,0.26)",
  "rgba(79,70,229,0.16)",
  "rgba(79,70,229,0.10)",
];

export default function AdminDashboard() {
  const { t } = useI18n();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [an, setAn] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminStats(), adminTrend(7), adminDashboardAnalytics()])
      .then(([s, tr, a]) => {
        setStats(s);
        setTrend(tr);
        setAn(a);
      })
      .catch((e) => reportError(e, { tag: "Admin.Dashboard" }))
      .finally(() => setLoading(false));
  }, []);

  if (loading || !stats || !an)
    return (
      <div className="text-center py-20">
        <Spin />
      </div>
    );

  const gmvSpark = trend.map((tr) => Number(tr.amount));
  const cards = [
    {
      title: t("admin.gmv"),
      value: an.comparison.gmv_now,
      format: (n: number) => `¥${money(n)}`,
      icon: <Coins size={20} />,
      accent: "#4F46E5",
      delta: an.comparison.gmv_rate,
      deltaLabel: t("admin.weekly"),
      spark: gmvSpark,
    },
    {
      title: t("admin.orders"),
      value: an.comparison.orders_now,
      icon: <ShoppingBag size={20} />,
      accent: "#4F46E5",
      delta: an.comparison.orders_rate,
      deltaLabel: t("admin.weekly"),
    },
    {
      title: t("admin.users"),
      value: stats.user_count,
      icon: <Users size={20} />,
      accent: "#4F46E5",
    },
    {
      title: t("admin.products"),
      value: stats.product_count,
      icon: <Package size={20} />,
      accent: "#4F46E5",
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<TrendingUp size={24} />}
        title={t("admin.dashboardTitle")}
        subtitle={t("admin.dashboardSub")}
      />

      <Row gutter={[16, 16]}>
        {cards.map((c, i) => (
          <Col key={c.title} xs={24} sm={12} lg={6}>
            <Reveal delay={i * 70}>
              <StatCard {...c} loading={false} />
            </Reveal>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Reveal>
            <Card className="chart-card mt-4" styles={{ body: { padding: 20 } }}>
              <div className="section-title">
                <span className="st-text">{t("admin.gmvTrend")}</span>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trend.map((tr) => ({ date: tr.date, amount: Number(tr.amount) }))}>
                  <defs>
                    <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F7" />
                  <XAxis dataKey="date" stroke="#94A3B8" />
                  <YAxis stroke="#94A3B8" />
                  <Tooltip />
                  <Area type="monotone" dataKey="amount" name={t("common.amount")} stroke="#4F46E5" strokeWidth={2.5} fill="url(#gmvGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </Reveal>
        </Col>
        <Col xs={24} lg={8}>
          <Reveal delay={80}>
            <Card className="chart-card mt-4" styles={{ body: { padding: 20 } }}>
              <div className="section-title">
                <span className="st-text">{t("admin.categoryShare")}</span>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={an.category_breakdown}
                    dataKey="sales"
                    nameKey="category"
                    innerRadius={55}
                    outerRadius={92}
                    paddingAngle={3}
                  >
                    {an.category_breakdown.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                {an.category_breakdown.map((c, i) => (
                  <span key={c.category} className="flex items-center gap-1 text-xs text-slate-500">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    {c.category}
                  </span>
                ))}
              </div>
            </Card>
          </Reveal>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Reveal>
            <Card className="chart-card mt-4" styles={{ body: { padding: 20 } }}>
              <div className="section-title">
                <span className="st-text">{t("admin.funnel")}</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <FunnelChart>
                  <Funnel dataKey="value" data={an.funnel} isAnimationActive>
                    <LabelList position="right" fill="#475569" stroke="none" dataKey="stage" />
                    <LabelList position="center" fill="#334155" stroke="none" dataKey="value" />
                    {an.funnel.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Funnel>
                  <Tooltip />
                </FunnelChart>
              </ResponsiveContainer>
            </Card>
          </Reveal>
        </Col>
        <Col xs={24} lg={16}>
          <Reveal delay={80}>
            <Card className="chart-card mt-4" styles={{ body: { padding: 20 } }}>
              <div className="section-title">
                <span className="st-text">{t("admin.topProducts")}</span>
              </div>
              <div className="space-y-3">
                {an.top_products.length === 0 && (
                  <div className="text-slate-400 text-sm">{t("admin.noSales")}</div>
                )}
                {an.top_products.map((p, i) => {
                  const max = an.top_products[0]?.revenue || 1;
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <span
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: "#4F46E5" }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium truncate">{p.name}</span>
                          <span className="text-[#4F46E5] font-semibold">¥{money(p.revenue)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.max(8, (p.revenue / max) * 100)}%`,
                              background: PIE_COLORS[i % PIE_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </Reveal>
        </Col>
      </Row>
    </div>
  );
}
