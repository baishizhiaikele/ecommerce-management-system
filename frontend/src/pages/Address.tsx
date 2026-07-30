import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { Card, Button, Modal, Form, Input, Switch, Popconfirm, message, Empty, Tag } from "antd";
import { Plus, Edit, Delete, MapPin } from "lucide-react";
import { listAddresses, createAddress, updateAddress, deleteAddress, AddressOut } from "../api";
import { useI18n } from "../i18n";

export default function AddressBook() {
  const { t } = useI18n();
  const [list, setList] = useState<AddressOut[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AddressOut | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    try {
      setList(await listAddresses());
    } catch {
      /* 忽略 */
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    setOpen(true);
  };
  const openEdit = (a: AddressOut) => {
    setEditing(a);
    form.setFieldsValue(a);
    setOpen(true);
  };
  const submit = async () => {
    const v = await form.validateFields();
    try {
      if (editing) await updateAddress(editing.id, v);
      else await createAddress(v);
      message.success(t("address.saved"));
      setOpen(false);
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      if (err.response?.status !== 422) message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };
  const del = async (id: string) => {
    try {
      await deleteAddress(id);
      message.success(t("common.success"));
      load();
    } catch {
      message.error(t("address.deleteFail"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="section-title">
        <h2>{t("page.address.title")}</h2>
        <Button className="ml-auto" type="primary" icon={<Plus size={16} />} onClick={openAdd}>
          {t("address.new")}
        </Button>
      </div>

      {list.length === 0 ? (
        <Empty className="py-16" description={t("empty.address")} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((a) => (
            <Card key={a.id} className="soft-card">
              <div className="flex items-start gap-2">
                <MapPin className="text-[#4F46E5] mt-1" size={18} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{a.receiver}</span>
                    <span className="text-slate-400 text-sm">{a.phone}</span>
                    {a.is_default && <Tag color="green">{t("address.default")}</Tag>}
                  </div>
                  <div className="text-slate-500 text-sm mt-1">
                    {a.province}
                    {a.city}
                    {a.district}
                    {a.detail}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <Button size="small" icon={<Edit size={14} />} onClick={() => openEdit(a)}>
                  {t("common.edit")}
                </Button>
                <Popconfirm title={t("address.confirmDelete")} onConfirm={() => del(a.id)}>
                  <Button size="small" danger icon={<Delete size={14} />}>
                    {t("common.delete")}
                  </Button>
                </Popconfirm>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        title={editing ? t("address.edit") : t("address.new")}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={submit}
        okText={t("common.save")}
        destroyOnClose
      >
        <Form form={form} layout="vertical" className="mt-4">
          <Form.Item name="receiver" label={t("address.name")} rules={[{ required: true, message: t("address.reqReceiver") }]}>
            <Input placeholder={t("address.phReceiver")} />
          </Form.Item>
          <Form.Item name="phone" label={t("address.phone")} rules={[{ required: true, message: t("address.reqPhone") }]}>
            <Input placeholder={t("address.phPhone")} />
          </Form.Item>
          <div className="grid grid-cols-3 gap-2">
            <Form.Item name="province" label={t("address.province")} rules={[{ required: true, message: t("address.reqProvince") }]}>
              <Input placeholder={t("address.province")} />
            </Form.Item>
            <Form.Item name="city" label={t("address.city")} rules={[{ required: true, message: t("address.reqCity") }]}>
              <Input placeholder={t("address.city")} />
            </Form.Item>
            <Form.Item name="district" label={t("address.district")} rules={[{ required: true, message: t("address.reqDistrict") }]}>
              <Input placeholder={t("address.district")} />
            </Form.Item>
          </div>
          <Form.Item name="detail" label={t("address.detail")} rules={[{ required: true, message: t("address.reqDetail") }]}>
            <Input.TextArea rows={2} placeholder={t("address.phDetail")} />
          </Form.Item>
          <Form.Item name="is_default" label={t("address.setDefault")} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
