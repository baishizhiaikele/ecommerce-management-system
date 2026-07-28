import { useEffect, useState } from "react";
import { Table, Card, Spin, Tag } from "antd";
import EmptyState from "../../components/EmptyState";
import { adminAuditLogs, AuditLogOut } from "../../api";
import { useI18n } from "../../i18n";

export default function AdminAudit() {
  const { t } = useI18n();
  const [items, setItems] = useState<AuditLogOut[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    adminAuditLogs()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="text-center py-10"><Spin /></div>;
  return (
    <Card title={t("admin.auditLog")} className="soft-card">
      <Table
        rowKey="id"
        dataSource={items}
        pagination={{ pageSize: 20 }}
        locale={{
          emptyText: <EmptyState title={t("admin.noAudit")} description={t("admin.noAuditDesc")} />,
        }}
        columns={[
          {
            title: t("admin.time"),
            dataIndex: "created_at",
            render: (v) => new Date(v).toLocaleString(),
          },
          { title: t("common.action"), dataIndex: "action", render: (v) => <Tag color="blue">{v}</Tag> },
          { title: t("admin.entity"), dataIndex: "entity" },
          { title: t("admin.entityId"), dataIndex: "entity_id", render: (v) => v || "-" },
          { title: t("admin.detail"), dataIndex: "detail", render: (v) => v || "-" },
          { title: t("admin.operator"), dataIndex: "user_id", render: (v) => v || t("admin.system") },
        ]}
      />
    </Card>
  );
}
