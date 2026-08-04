import { useEffect, useMemo, useState } from "react";
import { List, Button, Badge, Tag, Spin, message, Tabs, Popover, Checkbox } from "antd";
import {
  BellOutlined,
  GiftOutlined,
  TrophyOutlined,
  WarningOutlined,
  ShoppingOutlined,
  NotificationOutlined,
} from "@ant-design/icons";
import { listNotifications, markRead, markAllRead, NotificationOut, NotificationType, getErrorMessage } from "../api";
import { useI18n } from "../i18n";
import { useNavigate } from "react-router-dom";
import EmptyState from "../components/EmptyState";
import AsyncBoundary from "../components/AsyncBoundary";

const META: Record<NotificationType, { icon: React.ReactNode; color: string }> = {
  order: { icon: <ShoppingOutlined />, color: "#4F46E5" },
  coupon: { icon: <GiftOutlined />, color: "#4F46E5" },
  points: { icon: <TrophyOutlined />, color: "#F59E0B" },
  review_alert: { icon: <WarningOutlined />, color: "#EF4444" },
  system: { icon: <BellOutlined />, color: "#64748B" },
};

const TYPES: NotificationType[] = ["order", "coupon", "points", "review_alert", "system"];
const MUTE_KEY = "notif_muted_types";

const readMute = (): NotificationType[] => {
  try {
    const r = JSON.parse(localStorage.getItem(MUTE_KEY) || "[]");
    return Array.isArray(r) ? (r as NotificationType[]) : [];
  } catch {
    return [];
  }
};

export default function Notifications() {
  const [items, setItems] = useState<NotificationOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<"all" | NotificationType>("all");
  const [muted, setMuted] = useState<NotificationType[]>(readMute);
  const { t } = useI18n();
  const nav = useNavigate();

  const load = async () => {
    setLoadError(false);
    setLoading(true);
    try {
      setItems(await listNotifications());
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

  const visible = useMemo(
    () =>
      items.filter((n) => {
        if (muted.includes(n.type)) return false;
        if (tab !== "all" && n.type !== tab) return false;
        return true;
      }),
    [items, tab, muted]
  );

  const onRead = async (n: NotificationOut) => {
    if (n.is_read) return;
    try {
      await markRead(n.id);
      setItems((s) => s.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };

  const [markingAll, setMarkingAll] = useState(false);
  const onAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await markAllRead();
      message.success(t("notif.markAllRead"));
      setItems((s) => s.map((x) => ({ ...x, is_read: true })));
    } catch (e) {
      message.error(getErrorMessage(e));
    } finally {
      setMarkingAll(false);
    }
  };

  const toggleMute = (type: NotificationType, checked: boolean) => {
    const next = checked ? [...muted, type] : muted.filter((x) => x !== type);
    setMuted(next);
    localStorage.setItem(MUTE_KEY, JSON.stringify(next));
  };

  const mutePopover = (
    <div className="space-y-1">
      {TYPES.map((ty) => (
        <div key={ty} className="flex items-center gap-2">
          <Checkbox
            checked={muted.includes(ty)}
            onChange={(e) => toggleMute(ty, e.target.checked)}
          >
            {t(`notif.tab.${ty}`)}
          </Checkbox>
        </div>
      ))}
    </div>
  );

  const tabItems = [
    { key: "all", label: t("notif.tab.all") },
    ...TYPES.map((ty) => ({ key: ty, label: t(`notif.tab.${ty}`) })),
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BellOutlined className="text-[#4F46E5]" />
          <h2 className="text-xl font-bold m-0">{t("page.notifications.title")}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button icon={<NotificationOutlined />} onClick={() => nav("/settings/notifications")}>
            {t("notif.title")}
          </Button>
          <Popover content={mutePopover} title={t("notif.mute")} trigger="click">
            <Button icon={<NotificationOutlined />}>{t("notif.mute")}</Button>
          </Popover>
          <Button type="primary" loading={markingAll} onClick={onAll}>
            {t("notif.markAllRead")}
          </Button>
        </div>
      </div>

      {muted.length > 0 && (
        <div className="mb-3 text-xs text-slate-400">
          {t("notif.mutedHint")}
          {muted.map((ty) => t(`notif.tab.${ty}`)).join("、")}
        </div>
      )}

      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as "all" | NotificationType)}
        items={tabItems}
      />

      <AsyncBoundary loading={loading} error={loadError ? t("common.loadFailed") : null} retry={load}>
        {visible.length === 0 ? (
          <EmptyState title={t("notif.empty")} description={t("notif.emptyDesc")} />
        ) : (
          <div className="card-soft overflow-hidden">
            <List
              dataSource={visible}
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
                          {!n.is_read && <Tag color="blue">{t("notif.unread")}</Tag>}
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
      </AsyncBoundary>
    </div>
  );
}
