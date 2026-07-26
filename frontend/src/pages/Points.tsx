import { useEffect, useState } from "react";
import { Card, Progress, List, Tag, Spin, Typography } from "antd";
import { TrophyOutlined } from "@ant-design/icons";
import EmptyState from "../components/EmptyState";
import { pointHistory, PointLogOut } from "../api";
import { useAuth, vipTier } from "../store/auth";

const { Paragraph, Text } = Typography;

const ACTION_LABEL: Record<string, string> = {
  order_complete: "订单完成奖励",
  redeem: "积分抵扣",
  refund: "退款回收",
  admin_adjust: "管理员调整",
  signin: "每日签到",
};

export default function Points() {
  const user = useAuth((s) => s.user);
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
          background: "linear-gradient(120deg, #6366F1 0%, #22D3EE 100%)",
          border: "none",
          color: "#fff",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="opacity-80 text-sm">当前可用积分</div>
            <div className="text-4xl font-bold my-1">{points}</div>
            <Tag color="gold" className="!text-black/80">
              {tier.name}
            </Tag>
          </div>
          <TrophyOutlined style={{ fontSize: 56, opacity: 0.9 }} />
        </div>
        <div className="mt-4">
          <div className="text-xs opacity-90 mb-1">
            距 {tier.name === "钻石会员" ? "顶级" : "下一等级"} 还需 {Math.max(tier.next - points, 0)} 积分
          </div>
          <Progress
            percent={pct}
            showInfo={false}
            strokeColor="#fff"
            trailColor="rgba(255,255,255,0.3)"
          />
        </div>
      </Card>

      <Card className="rounded-2xl mb-4 soft-card fade-up" title="积分规则">
        <Paragraph className="m-0 text-slate-600">
          · 每消费 1 元订单完成可得 <Text strong>1 积分</Text>；<br />
          · <Text strong>100 积分可抵扣 1 元</Text>，结算时可在「使用积分」中勾选；<br />
          · 退款订单将回收对应的奖励积分。
        </Paragraph>
      </Card>

      <Card className="rounded-2xl soft-card fade-up" title="积分明细">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spin />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState title="暂无积分记录" description="消费、签到都会累积积分" />
        ) : (
          <List
            dataSource={logs}
            renderItem={(l) => (
              <List.Item>
                <List.Item.Meta
                  title={ACTION_LABEL[l.action] || l.action}
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
