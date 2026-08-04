import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Progress, List, Tag, Spin, Typography, Tooltip, Button, message } from "antd";
import { TrophyOutlined, CheckCircleFilled } from "@ant-design/icons";
import { Gift } from "lucide-react";
import EmptyState from "../components/EmptyState";
import AsyncBoundary from "../components/AsyncBoundary";
import { pointHistory, PointLogOut, me, getErrorMessage } from "../api";
import { formatDateTime } from "../utils/format";
import { useAuth, vipTier, VIP_TIERS, type AuthUser } from "../store/auth";
import { useI18n } from "../i18n";

const { Paragraph } = Typography;

const ACTION_LABEL: Record<string, string> = {
  order_complete: "points.action.order_complete",
  redeem: "points.action.deduct",
  refund: "refund_recover",
  admin_adjust: "points.action.admin_adjust",
  signin: "points.action.signin_daily",
};

const TIER_PERK_KEYS = ["signin", "ship", "discount", "exclusive"] as const;

export default function Points() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const { t } = useI18n();
  const navigate = useNavigate();
  const points = user?.points ?? 0;
  // 等级由成长值决定，与可消费的积分余额解耦（兑换扣积分不会掉级）
  const growth = user?.growth_value ?? 0;
  const tier = vipTier(growth);
  const [logs, setLogs] = useState<PointLogOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    setLoadError(false);
    setLoading(true);
    try {
      // 同步最新用户积分（签到/任务加分后在积分页直接反映）
      try {
        const fresh = await me();
        setUser(fresh as unknown as AuthUser);
      } catch {
        /* 忽略：积分余额同步失败不阻断历史加载 */
      }
      setLogs(await pointHistory());
    } catch (e) {
      setLoadError(true);
      message.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  // 进度按「当前等级区间内的完成度」计算，而不是除以下一级总阈值
  const pct =
    tier.next >= 999999
      ? 100
      : Math.min(
          100,
          Math.max(0, Math.round(((growth - tier.min) / (tier.next - tier.min)) * 100)),
        );

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
            <div className="flex items-center gap-2">
              <Tag color="gold" className="!text-black/80">
                {tier.name}
              </Tag>
              <span className="text-xs opacity-90">
                {t("points.growthValue").replace("{n}", String(growth))}
              </span>
            </div>
          </div>
          <TrophyOutlined style={{ fontSize: 56, opacity: 0.9 }} />
        </div>
        <div className="mt-4">
          <div className="text-xs opacity-90 mb-1">
            {t("points.toNext")
              .replace(
                "{target}",
                tier.next >= 999999 ? t("points.top") : t("points.nextTier"),
              )
              .replace("{n}", String(Math.max(tier.next - growth, 0)))}
          </div>
          <Progress
            percent={pct}
            showInfo={false}
            strokeColor="#fff"
            trailColor="rgba(255,255,255,0.3)"
          />
        </div>
      </Card>

      {/* 积分商城入口 */}
      <Card
        className="rounded-2xl mb-4 soft-card fade-up cursor-pointer"
        onClick={() => navigate("/mall")}
        styles={{ body: { padding: "14px 18px" } }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-orange-50 text-[#F97316] flex items-center justify-center">
              <Gift size={20} />
            </span>
            <div>
              <div className="font-semibold text-slate-800">{t("points.goMall")}</div>
              <div className="text-xs text-slate-400">{t("points.goMallDesc")}</div>
            </div>
          </div>
          <Button type="primary" size="small">
            {t("points.next.redeem")}
          </Button>
        </div>
      </Card>

      {/* 会员等级划分 */}
      <Card className="rounded-2xl mb-4 soft-card fade-up" title={t("points.tierTitle")}>
        <Paragraph className="m-0 text-slate-500 mb-4">{t("points.tierHint")}</Paragraph>
        <div className="space-y-3">
          {VIP_TIERS.map((x, i) => {
            const isCurrent = x.key === tier.key;
            const isReached = growth >= x.min;
            const gap = x.min - growth;
            return (
              <div
                key={x.key}
                className={
                  "flex items-center justify-between rounded-xl px-4 py-3 border transition " +
                  (isCurrent
                    ? "border-[#4F46E5] bg-indigo-50"
                    : "border-slate-200 bg-white")
                }
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ background: x.color }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{x.name}</span>
                      {isCurrent && (
                        <Tag color="blue" className="!m-0">
                          {t("points.tierCurrent")}
                        </Tag>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      {x.next >= 999999
                        ? t("points.tierRangeTop").replace("{min}", String(x.min))
                        : t("points.tierRange").replace("{min}", String(x.min))}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {isReached ? (
                    <span className="text-green-600 text-sm flex items-center gap-1 justify-end">
                      <CheckCircleFilled /> {t("points.tierPerks")}
                    </span>
                  ) : (
                    <Tooltip title={t("points.tierPerks")}>
                      <span className="text-xs text-slate-400">
                        {t("points.tierLocked").replace("{n}", String(gap))}
                      </span>
                    </Tooltip>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 当前等级权益 */}
        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
          <div className="text-sm font-semibold mb-2" style={{ color: tier.color }}>
            {tier.name} · {t("points.tierPerks")}
          </div>
          <ul className="m-0 pl-5 text-slate-600 text-sm space-y-1">
            {TIER_PERK_KEYS.map((k) => (
              <li key={k}>{t(`points.perk.${k}`)}</li>
            ))}
          </ul>
        </div>
      </Card>

      {/* 积分规则说明 */}
      <Card className="rounded-2xl mb-4 soft-card fade-up" title={t("points.rulesTitle")}>
        <ul className="m-0 pl-5 text-slate-600 space-y-2">
          <li>{t("points.rule.earn")}</li>
          <li>{t("points.rule.use")}</li>
          <li>{t("points.rule.refund")}</li>
          <li>{t("points.rule.expire")}</li>
        </ul>
      </Card>

      <Card className="rounded-2xl soft-card fade-up" title={t("sec.pointsHistory")}>
        <AsyncBoundary loading={loading} error={loadError ? t("common.loadFailed") : null} retry={load}>
          {logs.length === 0 ? (
            <EmptyState title={t("empty.points")} description={t("empty.pointsDesc")} />
          ) : (
            <List
              dataSource={logs}
              renderItem={(l) => (
                <List.Item>
                  <List.Item.Meta
                    title={t(ACTION_LABEL[l.action] || l.action)}
                    description={`${l.remark ? l.remark + " · " : ""}${formatDateTime(l.created_at)}`}
                  />
                  <span className={l.delta >= 0 ? "text-green-600" : "text-red-500"}>
                    {l.delta >= 0 ? `+${l.delta}` : l.delta}（余 {l.balance}）
                  </span>
                </List.Item>
              )}
            />
          )}
        </AsyncBoundary>
      </Card>
    </div>
  );
}
