import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { Table, message, Card, Select, Switch, Spin } from "antd";
import EmptyState from "../../components/EmptyState";
import { adminListUsers, adminUpdateUser, UserOut, Role } from "../../api";
import { useI18n } from "../../i18n";
import { formatDateTime } from "../../utils/format";

export default function AdminUsers() {
  const { t } = useI18n();
  const [items, setItems] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      setItems(await adminListUsers());
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const toggleActive = async (u: UserOut) => {
    try {
      await adminUpdateUser(u.id, { is_active: !u.is_active });
      message.success(t("common.updated"));
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };
  const changeRole = async (u: UserOut, role: Role) => {
    try {
      await adminUpdateUser(u.id, { role });
      message.success(t("common.updated"));
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };

  return (
    <Card title={t("admin.userMgmt")} className="soft-card">
      {loading ? (
        <div className="text-center py-10">
          <Spin />
        </div>
      ) : (
        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          locale={{
            emptyText: <EmptyState title={t("admin.noUsers")} description={t("admin.noUsersDesc")} />,
          }}
          columns={[
            { title: t("admin.username"), dataIndex: "username" },
            { title: t("admin.email"), dataIndex: "email" },
            {
              title: t("admin.role"),
              dataIndex: "role",
              render: (r, u) => (
                <Select
                  value={u.role}
                  style={{ width: 120 }}
                  disabled={u.role === "admin"}
                  onChange={(v) => changeRole(u, v)}
                  options={[
                    { value: "buyer", label: t("role.buyer") },
                    { value: "merchant", label: t("role.merchant") },
                    { value: "admin", label: t("role.admin") },
                  ]}
                />
              ),
            },
            {
              title: t("common.status"),
              dataIndex: "is_active",
              render: (v, u) => (
                <Switch
                  checked={v}
                  disabled={u.role === "admin"}
                  checkedChildren={t("common.normal")}
                  unCheckedChildren={t("common.disabled")}
                  onChange={() => toggleActive(u)}
                />
              ),
            },
            {
              title: t("admin.regTime"),
              dataIndex: "created_at",
              render: (v) => formatDateTime(v),
            },
          ]}
        />
      )}
    </Card>
  );
}
