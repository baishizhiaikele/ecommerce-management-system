import { useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import {
  createSubaccount,
  deleteSubaccount,
  listStaffPermissions,
  listSubaccounts,
  StaffOut,
  StaffPerm,
  updateSubaccount,
} from "../../api";
import { Button, Card, Checkbox, Form, Input, Modal, Popconfirm, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";

export default function Staff() {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<StaffOut[]>([]);
  const [perms, setPerms] = useState<StaffPerm[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([listSubaccounts(), listStaffPermissions()]);
      setRows(r);
      setPerms(p.permissions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    const v = await form.validateFields();
    setSaving(true);
    try {
      await createSubaccount(v);
      message.success(t("staff.created"));
      setOpen(false);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: StaffOut, active: boolean) => {
    await updateSubaccount(r.id, { is_active: active });
    load();
  };

  const remove = async (id: string) => {
    await deleteSubaccount(id);
    message.success(t("common.deleted"));
    load();
  };

  const columns: ColumnsType<StaffOut> = [
    { title: t("staff.username"), dataIndex: "username" },
    {
      title: t("staff.perms"),
      dataIndex: "permissions",
      render: (ps: string[]) =>
        ps.length
          ? ps.map((k) => (
              <Tag key={k} color="blue">
                {perms.find((p) => p.key === k)?.label || k}
              </Tag>
            ))
          : <Tag>{t("staff.none")}</Tag>,
    },
    {
      title: t("staff.status"),
      dataIndex: "is_active",
      render: (a: boolean, r) => (
        <Popconfirm
          title={a ? t("staff.confirmDisable") : t("staff.confirmEnable")}
          onConfirm={() => toggle(r, !a)}
        >
          <Button size="small" type={a ? "default" : "primary"}>
            {a ? t("staff.enabled") : t("staff.disabled")}
          </Button>
        </Popconfirm>
      ),
    },
    {
      title: t("common.actions"),
      render: (_, r) => (
        <Popconfirm title={t("common.confirmDelete")} onConfirm={() => remove(r.id)}>
          <Button size="small" danger>
            {t("common.delete")}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="section-title">
        <div>
          <h2 className="m-0">{t("staff.title")}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{t("staff.desc")}</p>
        </div>
        <Button className="ml-auto" type="primary" onClick={() => setOpen(true)}>
          {t("staff.create")}
        </Button>
      </div>

      <Card className="soft-card">
        <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} />
      </Card>

      <Modal
        title={t("staff.create")}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="username"
            label={t("staff.username")}
            rules={[{ required: true, min: 3, message: t("staff.reqUsername") }]}
          >
            <Input placeholder={t("staff.usernamePh")} />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("staff.password")}
            rules={[{ required: true, min: 6, message: t("staff.reqPassword") }]}
          >
            <Input.Password placeholder={t("staff.passwordPh")} />
          </Form.Item>
          <Form.Item name="permissions" label={t("staff.perms")} initialValue={[]}>
            <Checkbox.Group
              options={perms.map((p) => ({ label: lang === "zh" ? p.label : p.key, value: p.key }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
