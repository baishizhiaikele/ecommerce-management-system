import { useEffect, useState } from "react";
import { Table, Card, Spin, Tag } from "antd";
import EmptyState from "../../components/EmptyState";
import { adminAuditLogs, AuditLogOut } from "../../api";

export default function AdminAudit() {
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
    <Card title="审计日志" className="soft-card">
      <Table
        rowKey="id"
        dataSource={items}
        pagination={{ pageSize: 20 }}
        locale={{
          emptyText: <EmptyState title="暂无审计日志" description="系统关键操作记录会显示在这里" />,
        }}
        columns={[
          {
            title: "时间",
            dataIndex: "created_at",
            render: (v) => new Date(v).toLocaleString(),
          },
          { title: "操作", dataIndex: "action", render: (v) => <Tag color="blue">{v}</Tag> },
          { title: "对象", dataIndex: "entity" },
          { title: "对象ID", dataIndex: "entity_id", render: (v) => v || "-" },
          { title: "详情", dataIndex: "detail", render: (v) => v || "-" },
          { title: "操作人", dataIndex: "user_id", render: (v) => v || "系统" },
        ]}
      />
    </Card>
  );
}
