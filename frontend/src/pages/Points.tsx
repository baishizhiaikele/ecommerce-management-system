import { useEffect, useState } from "react";
import { Card, Progress, List, Tag, Spin, Typography } from "antd";
import { TrophyOutlined } from "@ant-design/icons";
import EmptyState from "../components/EmptyState";
import { pointHistory, PointLogOut } from "../api";
import { useAuth, vipTier } from "../store/auth";
import { useI18n } from "../i18n";

const { Paragraph, Text } = Typography;

const ACTION_LABEL: Record<string, string> = {
  order_complete: "points.action.order_complete",
  redeem: "points.action.deduct",
  refund: "points.action.refund_recover",
  admin_adjust: "points.action.admin_adjust",
  signin: "points.action.signin_daily",
};

export default function Points() {
  const user = useAuth((s) => s.user);
  const { t } = useI18n();
  const points = user?.points ?? 0;
  const tier = vipTier(points);
  const [logs, setLogs] = useState<PointLogOut[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setLogs(await pointHistory());
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const pct = tier.next >= 999999 ? 100 : Math.min(100, Math.round((points / tier.next) * 100));

  return (
    <div>
      <Card
        className="rounded-2xl mb-4 fade-up"
        style={{
          background: "#4F46E5",
          border: "none",
          color: "#fff",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="opacity-80 text-sm">{t("points.currentAvailable")}</div>
            <div className="text-4xl font-bold my-1">{points}</div>
            <Tag color="gold" className="!text-black/80">
              {tier.name}
            </Tag>
          </div>
          <TrophyOutlined style={{ fontSize: 56, opacity: 0.9 }} />
        </div>
        <div className="mt-4">
          <div className="text-xs opacity-90 mb-1">
            {t("points.toNext")
              .replace("{target}", tier.name === "钻石会员" ? t("points.top") : t("points.nextTier"))
              .replace("{n}", String(Math.max(tier.next - points, 0)))}
          </div>
          <Progress
            percent={pct}
            showInfo={false}
            strokeColor="#fff"
            trailColor="rgba(255,255,255,0.3)"
          />
        </div>
      </Card>

      <Card className="rounded-2xl mb-4 soft-card fade-up" title={t("sec.pointsRules")}>
        <Paragraph className="m-0 text-slate-600">{t("points.rulesText")}</Paragraph>
      </Card>

      <Card className="rounded-2xl soft-card fade-up" title={t("sec.pointsHistory")}>
        {loading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState title={t("empty.points")} description={t("empty.pointsDesc")} />
        ) : (
          <List
            dataSource={logs}
            renderItem={(l) => (
              <List.Item>
                <List.Item.Meta
                  title={t(ACTION_LABEL[l.action] || l.action)}
                  description={l.remark || l.created_at}
                />
                <span className={l.delta >= 0 ? "text-green-600" : "text-red-500"}>
                  {l.delta >= 0 ? `+${l.delta}` : l.delta}（余 {l.balance}）
                </span>
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
}
