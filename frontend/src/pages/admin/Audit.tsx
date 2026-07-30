import { useEffect, useState } from "react";
import { Table, Card, Spin, Tag, Tabs, Drawer, Button, List, Input, message } from "antd";
import EmptyState from "../../components/EmptyState";
import { adminAuditLogs, AuditLogOut, getAuditAlerts, getAuditReplay, AuditAlert, AuditLogItem } from "../../api";
import { useI18n } from "../../i18n";
import { formatDateTime } from "../../utils/format";

export default function AdminAudit() {
  const { t } = useI18n();
  const [items, setItems] = useState<AuditLogOut[]>([]);
  const [loading, setLoading] = useState(true);

  const [replay, setReplay] = useState<AuditLogItem[]>([]);
  const [replayOpen, setReplayOpen] = useState(false);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replayTitle, setReplayTitle] = useState("");

  const [alerts, setAlerts] = useState<AuditAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  const load = () => {
    setLoading(true);
    adminAuditLogs()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const openReplay = async (entity: string, entityId?: string) => {
    setReplayOpen(true);
    setReplayLoading(true);
    setReplayTitle(`${entity}${entityId ? " / " + entityId : ""}`);
    try {
      const data = await getAuditReplay(entity, entityId);
      setReplay(data);
    } catch {
      message.error(t("common.operationFailed"));
    } finally {
      setReplayLoading(false);
    }
  };

  const loadAlerts = async () => {
    setAlertsLoading(true);
    try {
      const r = await getAuditAlerts();
      setAlerts(r.alerts || []);
    } catch {
      message.error(t("common.operationFailed"));
    } finally {
      setAlertsLoading(false);
    }
  };

  const logColumns = [
    { title: t("admin.time"), dataIndex: "created_at", render: (v: string) => formatDateTime(v) },
    { title: t("common.action"), dataIndex: "action", render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: t("admin.entity"), dataIndex: "entity" },
    { title: t("admin.entityId"), dataIndex: "entity_id", render: (v: string) => v || "-" },
    { title: t("admin.detail"), dataIndex: "detail", render: (v: string) => v || "-" },
    {
      title: t("common.action"),
      render: (_: unknown, r: AuditLogOut) => (
        <Button size="small" onClick={() => openReplay(r.entity, r.entity_id ?? undefined)}>
          {t("admin.replay")}
        </Button>
      ),
    },
  ];

  return (
    <Card title={t("admin.auditLog")} className="soft-card">
      <Tabs
        items={[
          {
            key: "logs",
            label: t("admin.tabLogs"),
            children: loading ? (
              <div className="text-center py-10">
                <Spin />
              </div>
            ) : (
              <Table
                rowKey="id"
                dataSource={items}
                pagination={{ pageSize: 20 }}
                locale={{
                  emptyText: <EmptyState title={t("admin.noAudit")} description={t("admin.noAuditDesc")} />,
                }}
                columns={logColumns}
              />
            ),
          },
          {
            key: "replay",
            label: t("admin.tabReplay"),
            children: (
              <div>
                <div className="flex gap-2 mb-3">
                  <Input.Search
                    placeholder={t("admin.replayPh")}
                    enterButton={t("admin.replayBtn")}
                    onSearch={(v) => v && openReplay(v)}
                  />
                </div>
                <p className="text-xs text-slate-400 mb-2">{t("admin.replayHint")}</p>
                <List
                  dataSource={replay}
                  locale={{ emptyText: t("admin.emptyReplay") }}
                  renderItem={(it: any) => (
                    <List.Item>
                      <div>
                        <Tag color="blue">{it.action}</Tag>
                        <span className="text-xs text-slate-500">{it.created_at ? formatDateTime(it.created_at) : "-"}</span>
                        <div className="text-sm">{it.detail || "-"}</div>
                      </div>
                    </List.Item>
                  )}
                />
              </div>
            ),
          },
          {
            key: "alerts",
            label: t("admin.tabAlerts"),
            children: (
              <div>
                <Button className="mb-3" onClick={loadAlerts}>
                  {t("admin.refreshAlerts")}
                </Button>
                {alertsLoading ? (
                  <div className="text-center py-10">
                    <Spin />
                  </div>
                ) : alerts.length === 0 ? (
                  <EmptyState title={t("admin.noAlerts")} description={t("admin.noAlertsDesc")} />
                ) : (
                  <List
                    dataSource={alerts}
                    renderItem={(a: AuditAlert) => (
                      <List.Item>
                        <div>
                          <Tag color={a.level === "warning" ? "orange" : "cyan"}>{a.type}</Tag>
                          <div className="text-sm">{a.message}</div>
                          {a.samples && a.samples.length > 0 && (
                            <div className="text-xs text-slate-400 break-all">{a.samples.join(", ")}</div>
                          )}
                        </div>
                      </List.Item>
                    )}
                  />
                )}
              </div>
            ),
          },
        ]}
      />

      <Drawer title={`${t("admin.replay")}：${replayTitle}`} open={replayOpen} onClose={() => setReplayOpen(false)}>
        {replayLoading ? (
          <Spin />
        ) : (
          <TimelineList data={replay} />
        )}
      </Drawer>
    </Card>
  );
}

function TimelineList({ data }: { data: AuditLogItem[] }) {
  const { t } = useI18n();
  if (!data.length) return <div className="text-slate-400">{t("admin.emptyReplay")}</div>;
  return (
    <List
      dataSource={data}
      renderItem={(it: AuditLogItem) => (
        <List.Item>
          <div>
            <Tag color="blue">{it.action}</Tag>
            <span className="text-xs text-slate-500">{it.created_at ? formatDateTime(it.created_at) : "-"}</span>
            <div className="text-sm">{it.detail || "-"}</div>
          </div>
        </List.Item>
      )}
    />
  );
}
