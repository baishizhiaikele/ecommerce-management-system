import { useCallback, useEffect, useState } from "react";
import {
  Card,
  Progress,
  List,
  Tag,
  Button,
  Spin,
  Typography,
  message,
  Divider,
} from "antd";
import { CrownOutlined, GiftOutlined, ThunderboltOutlined } from "@ant-design/icons";
import EmptyState from "../components/EmptyState";
import {
  getMembership,
  listTasks,
  claimTask,
  getPlusStatus,
  subscribePlus,
  MembershipOut,
  TaskOut,
  PlusStatus,
} from "../api";
import { useI18n } from "../i18n";

const { Paragraph, Text } = Typography;

const TIER_COLOR: Record<string, string> = {
  bronze: "#b87333",
  silver: "#9ca3af",
  gold: "#f59e0b",
  diamond: "#06b6d4",
};

export default function Membership() {
  const { t: tr } = useI18n();
  const [member, setMember] = useState<MembershipOut | null>(null);
  const [tasks, setTasks] = useState<TaskOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [plus, setPlus] = useState<PlusStatus | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, t, p] = await Promise.all([getMembership(), listTasks(), getPlusStatus()]);
      setMember(m);
      setTasks(t);
      setPlus(p);
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubscribe = async (plan: string) => {
    setSubscribing(plan);
    try {
      const p = await subscribePlus(plan);
      setPlus(p);
      message.success(tr("plus.subscribed"));
    } catch {
      message.error(tr("plus.subscribeFail"));
    } finally {
      setSubscribing(null);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const onClaim = async (key: string) => {
    setClaiming(key);
    try {
      const r = await claimTask(key);
      message.success(tr("membership.claimSuccess").replace("{n}", String(r.gained)));
      await load();
    } catch (e: unknown) {
      message.error((e as { message?: string })?.message || tr("membership.claimFail"));
    } finally {
      setClaiming(null);
    }
  };

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (!member) return <EmptyState title={tr("common.loadFailed")} />;

  const color = TIER_COLOR[member.level] || "#6366f1";

  return (
    <div>
      <Card
        className="rounded-2xl mb-4 fade-up"
        style={{ background: `linear-gradient(135deg, ${color}, #4F46E5)`, border: "none", color: "#fff" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="opacity-80 text-sm">{tr("membership.currentTier")}</div>
            <div className="text-3xl font-bold my-1 flex items-center gap-2">
              <CrownOutlined /> {member.level_name}
            </div>
            <Tag color="gold" className="!text-black/80">
              {tr("membership.growth")} {member.growth_value}
            </Tag>
          </div>
          <CrownOutlined style={{ fontSize: 64, opacity: 0.85 }} />
        </div>
        <div className="mt-4">
          <div className="text-xs opacity-90 mb-1">
            {member.next_level_name
              ? tr("membership.toNextGrowth")
                  .replace("{name}", member.next_level_name)
                  .replace("{n}", String(Math.max((member.next_growth ?? 0) - member.growth_value, 0)))
              : tr("membership.maxTier")}
          </div>
          <Progress percent={Math.round((member.progress ?? 0) * 100)} showInfo={false} strokeColor="#fff" trailColor="rgba(255,255,255,0.3)" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {member.discount < 1 && (
            <Tag color="cyan" className="!text-black/80">{tr("membership.discount")} {(member.discount * 10).toFixed(1)}{tr("membership.zhe")}</Tag>
          )}
          {member.free_shipping && <Tag color="green" className="!text-black/80">{tr("membership.freeShipAll")}</Tag>}
        </div>
      </Card>

      {/* P3-H PLUS 付费会员 */}
      {plus && (
        <Card
          className="rounded-2xl mb-4 soft-card fade-up"
          title={
            <span className="flex items-center gap-2">
              <ThunderboltOutlined style={{ color: "#f59e0b" }} />
              {tr("plus.title")}
              {plus.active && <Tag color="gold">{tr("plus.active")}</Tag>}
            </span>
          }
        >
          {plus.active && (
            <Paragraph className="!mb-3 text-slate-600">
              {tr("plus.expireAt").replace(
                "{d}",
                plus.expire_at ? new Date(plus.expire_at).toLocaleDateString() : "-"
              )}
            </Paragraph>
          )}
          <ul className="m-0 pl-5 text-slate-600 mb-4">
            {plus.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plus.plans.map((p) => (
              <div
                key={p.key}
                className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold">{p.name}</div>
                  <div className="text-amber-600 font-bold text-lg">¥{p.price}</div>
                  <div className="text-xs text-slate-400">
                    {tr("plus.giftPoints").replace("{n}", String(p.gift_points))}
                  </div>
                </div>
                <Button
                  type="primary"
                  loading={subscribing === p.key}
                  onClick={() => onSubscribe(p.key)}
                  style={{ background: "#f59e0b", borderColor: "#f59e0b" }}
                >
                  {plus.active ? tr("plus.renew") : tr("plus.subscribe")}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="rounded-2xl mb-4 soft-card fade-up" title={tr("membership.perks")}>
        {member.benefits?.length ? (
          <ul className="m-0 pl-5 text-slate-600">
            {member.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : (
          <Paragraph className="m-0 text-slate-500">{tr("membership.noPerks")}</Paragraph>
        )}
      </Card>

      <Divider orientation="left">{tr("membership.tasks")}</Divider>
      <Card className="rounded-2xl soft-card fade-up">
        <List
          dataSource={tasks}
          renderItem={(task) => (
            <List.Item
              actions={[
                task.claimed ? (
                  <Tag color="success" key="c">{tr("membership.claimed")}</Tag>
                ) : task.done ? (
                  <Button
                    type="primary"
                    key="claim"
                    loading={claiming === task.key}
                    icon={<GiftOutlined />}
                    onClick={() => onClaim(task.key)}
                  >
                    {tr("membership.claim")} +{task.points}
                  </Button>
                ) : (
                  <Button key="undone" disabled>
                    {tr("membership.undone")}
                  </Button>
                ),
              ]}
            >
              <List.Item.Meta
                title={
                  <span className="flex items-center gap-2">
                    {task.name}
                    <Text type="secondary" className="text-xs">+{task.points} 积分</Text>
                  </span>
                }
                description={task.description}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
