import { useEffect, useState } from "react";
import { List, Button, Badge, Tag, Spin, message } from "antd";
import EmptyState from "../components/EmptyState";
import {
  BellOutlined,
  GiftOutlined,
  TrophyOutlined,
  WarningOutlined,
  ShoppingOutlined,
} from "@ant-design/icons";
import { listNotifications, markRead, markAllRead, NotificationOut, NotificationType } from "../api";

const META: Record<NotificationType, { icon: React.ReactNode; color: string }> = {
  order: { icon: <ShoppingOutlined />, color: "#6366F1" },
  coupon: { icon: <GiftOutlined />, color: "#22D3EE" },
  points: { icon: <TrophyOutlined />, color: "#F59E0B" },
  review_alert: { icon: <WarningOutlined />, color: "#EF4444" },
  system: { icon: <BellOutlined />, color: "#64748B" },
};

export default function Notifications() {
  const [items, setItems] = useState<NotificationOut[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listNotifications());
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const onRead = async (n: NotificationOut) => {
    if (n.is_read) return;
    try {
      await markRead(n.id);
      setItems((s) => s.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    } catch {
      /* 忽略 */
    }
  };

  const onAll = async () => {
    try {
      await markAllRead();
      message.success("已全部标为已读");
      setItems((s) => s.map((x) => ({ ...x, is_read: true })));
    } catch {
      /* 忽略 */
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BellOutlined className="text-[#6366F1]" />
          <h2 className="text-xl font-bold m-0">通知中心</h2>
        </div>
        <Button onClick={onAll}>全部已读</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-20">
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="暂无通知" description="重要动态会在这里提醒你" />
      ) : (
        <div className="shadow-sm rounded-2xl overflow-hidden border border-slate-100">
          <List
            dataSource={items}
            renderItem={(n) => {
              const m = META[n.type];
              return (
                <List.Item
                  className="px-4 cursor-pointer hover:bg-slate-50 transition"
                  style={{ background: n.is_read ? undefined : "#F5F3FF" }}
                  onClick={() => onRead(n)}
                >
                  <List.Item.Meta
                    avatar={
                      <Badge dot={!n.is_read} offset={[-4, 26]}>
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center"
                          style={{ background: `${m.color}1A`, color: m.color }}
                        >
                          {m.icon}
                        </div>
                      </Badge>
                    }
                    title={
                      <span className="flex items-center gap-2">
                        {n.title}
                        {!n.is_read && <Tag color="blue">未读</Tag>}
                      </span>
                    }
                    description={n.content}
                  />
                </List.Item>
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
