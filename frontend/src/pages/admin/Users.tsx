import { useEffect, useState } from "react";
import { Table, Tag, message, Card, Select, Switch, Spin } from "antd";
import { adminListUsers, adminUpdateUser, UserOut, Role } from "../../api";

export default function AdminUsers() {
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
      message.success("已更新");
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || "操作失败");
    }
  };
  const changeRole = async (u: UserOut, role: Role) => {
    try {
      await adminUpdateUser(u.id, { role });
      message.success("已更新");
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || "操作失败");
    }
  };

  return (
    <Card title="用户管理">
      {loading ? (
        <div className="text-center py-10">
          <Spin />
        </div>
      ) : (
        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          columns={[
            { title: "用户名", dataIndex: "username" },
            { title: "邮箱", dataIndex: "email" },
            {
              title: "角色",
              dataIndex: "role",
              render: (r, u) => (
                <Select
                  value={u.role}
                  style={{ width: 120 }}
                  disabled={u.role === "admin"}
                  onChange={(v) => changeRole(u, v)}
                  options={[
                    { value: "buyer", label: "买家" },
                    { value: "merchant", label: "商家" },
                    { value: "admin", label: "管理员" },
                  ]}
                />
              ),
            },
            {
              title: "状态",
              dataIndex: "is_active",
              render: (v, u) => (
                <Switch
                  checked={v}
                  disabled={u.role === "admin"}
                  checkedChildren="正常"
                  unCheckedChildren="禁用"
                  onChange={() => toggleActive(u)}
                />
              ),
            },
            {
              title: "注册时间",
              dataIndex: "created_at",
              render: (v) => new Date(v).toLocaleString(),
            },
          ]}
        />
      )}
    </Card>
  );
}
