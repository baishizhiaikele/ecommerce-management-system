import { useEffect, useState } from "react";
import { Card, Spin } from "antd";
import EmptyState from "../../components/EmptyState";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { auditStats } from "../../api";
import { useI18n } from "../../i18n";

interface AuditStats {
  by_action: { action: string; count: number }[];
  by_day: { day: string; count: number }[];
}

export default function AuditDashboard() {
  const { t } = useI18n();
  const [data, setData] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auditStats()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (!data || (data.by_action.length === 0 && data.by_day.length === 0))
    return <EmptyState title={t("admin.noAuditData")} description={t("admin.noAuditDataDesc")} />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-6 rounded bg-slate-300" />
        <h2 className="text-xl font-bold m-0">{t("admin.auditDash")}</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={t("admin.actionDist")} className="soft-card">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data.by_action} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="action" width={140} />
              <Tooltip />
              <Bar dataKey="count" fill="#4F46E5" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title={t("admin.dailyOps")} className="soft-card">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.by_day}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#4F46E5" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
