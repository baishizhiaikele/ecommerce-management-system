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
import { CrownOutlined, GiftOutlined } from "@ant-design/icons";
import EmptyState from "../components/EmptyState";
import { getMembership, listTasks, claimTask, MembershipOut, TaskOut } from "../api";

const { Paragraph, Text } = Typography;

const TIER_COLOR: Record<string, string> = {
  bronze: "#b87333",
  silver: "#9ca3af",
  gold: "#f59e0b",
  diamond: "#06b6d4",
};

export default function Membership() {
  const [member, setMember] = useState<MembershipOut | null>(null);
  const [tasks, setTasks] = useState<TaskOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, t] = await Promise.all([getMembership(), listTasks()]);
      setMember(m);
      setTasks(t);
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onClaim = async (key: string) => {
    setClaiming(key);
    try {
      const r = await claimTask(key);
      message.success(`领取成功，+${r.gained} 积分`);
      await load();
    } catch (e: unknown) {
      message.error((e as { message?: string })?.message || "领取失败");
    } finally {
      setClaiming(null);
    }
  };

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (!member) return <EmptyState title="加载失败" />;

  const color = TIER_COLOR[member.level] || "#6366f1";

  return (
    <div>
      <Card
        className="rounded-2xl mb-4 fade-up"
        style={{ background: `linear-gradient(135deg, ${color}, #4F46E5)`, border: "none", color: "#fff" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="opacity-80 text-sm">当前会员等级</div>
            <div className="text-3xl font-bold my-1 flex items-center gap-2">
              <CrownOutlined /> {member.level_name}
            </div>
            <Tag color="gold" className="!text-black/80">
              成长值 {member.growth_value}
            </Tag>
          </div>
          <CrownOutlined style={{ fontSize: 64, opacity: 0.85 }} />
        </div>
        <div className="mt-4">
          <div className="text-xs opacity-90 mb-1">
            {member.next_level_name
              ? `距「${member.next_level_name}」还需 ${Math.max((member.next_growth ?? 0) - member.growth_value, 0)} 成长值`
              : "已达最高等级"}
          </div>
          <Progress percent={Math.round(member.progress * 100)} showInfo={false} strokeColor="#fff" trailColor="rgba(255,255,255,0.3)" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {member.discount < 1 && (
            <Tag color="cyan" className="!text-black/80">会员折扣 {(member.discount * 10).toFixed(1)} 折</Tag>
          )}
          {member.free_shipping && <Tag color="green" className="!text-black/80">全场包邮</Tag>}
        </div>
      </Card>

      <Card className="rounded-2xl mb-4 soft-card fade-up" title="会员权益">
        {member.benefits.length ? (
          <ul className="m-0 pl-5 text-slate-600">
            {member.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : (
          <Paragraph className="m-0 text-slate-500">暂无额外权益，继续消费升级解锁更多。</Paragraph>
        )}
      </Card>

      <Divider orientation="left">任务中心</Divider>
      <Card className="rounded-2xl soft-card fade-up">
        <List
          dataSource={tasks}
          renderItem={(task) => (
            <List.Item
              actions={[
                task.claimed ? (
                  <Tag color="success" key="c">已领取</Tag>
                ) : task.done ? (
                  <Button
                    type="primary"
                    key="claim"
                    loading={claiming === task.key}
                    icon={<GiftOutlined />}
                    onClick={() => onClaim(task.key)}
                  >
                    领取 +{task.points}
                  </Button>
                ) : (
                  <Button key="undone" disabled>
                    未完成
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
