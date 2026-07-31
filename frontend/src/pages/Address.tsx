import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { Card, Button, Modal, Form, Input, Switch, Popconfirm, message, Empty, Tag, Cascader } from "antd";
import { Plus, Edit, Delete, MapPin } from "lucide-react";
import {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  parseAddressText,
  getErrorMessage,
  AddressOut,
  ParsedAddress,
} from "../api";
import { REGION_OPTIONS } from "../data/regions";
import { useI18n } from "../i18n";

export default function AddressBook() {
  const { t } = useI18n();
  const [list, setList] = useState<AddressOut[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AddressOut | null>(null);
  const [form] = Form.useForm();
  // P1-6 地址智能解析
  const [parseOpen, setParseOpen] = useState(false);
  const [parseText, setParseText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<ParsedAddress | null>(null);

  const runParse = async () => {
    if (!parseText.trim()) return;
    setParsing(true);
    try {
      const r = await parseAddressText(parseText);
      setParseResult(r);
    } catch {
      message.error(t("address.parseFail"));
    } finally {
      setParsing(false);
    }
  };
  const applyParse = () => {
    const r = parseResult;
    if (!r) return;
    // 回填：省市区 → 级联选择器；详细地址 → detail 字段
    form.setFieldsValue({
      region: [r.province, r.city, r.district].filter(Boolean),
      detail: r.detail,
    });
    setParseOpen(false);
    setParseResult(null);
    message.success(t("address.parseApplied"));
  };

  const load = async () => {
    try {
      setList(await listAddresses());
    } catch (e) {
      // 地址列表加载失败不能静默：否则用户会以为自己没存过地址，重复新建
      message.error(getErrorMessage(e));
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
    // 后端按省/市/区三字段存储，回填时拼成级联选择器的 [省,市,区] 数组
    form.setFieldsValue({ ...a, region: [a.province, a.city, a.district] });
    setOpen(true);
  };
  const submit = async () => {
    // 校验失败时 validateFields 会 reject，不拦住会变成未捕获异常
    let v: Record<string, unknown>;
    try {
      v = await form.validateFields();
    } catch {
      return;
    }
    try {
      // 级联选择器的值是 [省,市,区] 数组，拆回后端期望的三字段
      const region = (v.region as string[] | undefined) ?? [];
      const { region: _omit, ...rest } = v;
      const payload = {
        ...rest,
        province: region[0] ?? "",
        city: region[1] ?? "",
        district: region[2] ?? "",
      } as Omit<AddressOut, "id" | "user_id">;
      if (editing) await updateAddress(editing.id, payload);
      else await createAddress(payload);
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
        <div className="ml-auto flex gap-2">
          <Button icon={<MapPin size={16} />} onClick={() => setParseOpen(true)}>
            {t("address.parse")}
          </Button>
          <Button type="primary" icon={<Plus size={16} />} onClick={openAdd}>
            {t("address.new")}
          </Button>
        </div>
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
          <Form.Item
            name="phone"
            label={t("address.phone")}
            normalize={(v?: string) => (v ?? "").replace(/\s/g, "")}
            rules={[
              { required: true, message: t("address.reqPhone") },
              {
                // 11 位手机号或带区号固话，格式错了会直接导致配送联系不上
                pattern: /^(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})$/,
                message: t("address.invalidPhone"),
              },
            ]}
          >
            <Input placeholder={t("address.phPhone")} maxLength={13} inputMode="tel" />
          </Form.Item>
          <Form.Item
            name="region"
            label={t("address.region")}
            rules={[{ required: true, message: t("address.reqRegion") }]}
          >
            <Cascader
              options={REGION_OPTIONS}
              placeholder={t("address.phRegion")}
              expandTrigger="hover"
            />
          </Form.Item>
          <Form.Item
            name="detail"
            label={t("address.detail")}
            rules={[
              { required: true, message: t("address.reqDetail") },
              { min: 5, message: t("address.detailTooShort") },
            ]}
          >
            <Input.TextArea rows={2} placeholder={t("address.phDetail")} maxLength={120} showCount />
          </Form.Item>
          <Form.Item name="is_default" label={t("address.setDefault")} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* P1-6 地址智能解析：粘贴整段文本一键识别省/市/区 */}
      <Modal
        title={t("address.parse")}
        open={parseOpen}
        onCancel={() => setParseOpen(false)}
        onOk={parseResult ? applyParse : runParse}
        okText={parseResult ? t("address.applyParse") : t("address.runParse")}
        confirmLoading={parsing}
      >
        <Input.TextArea
          rows={3}
          value={parseText}
          onChange={(e) => {
            setParseText(e.target.value);
            setParseResult(null);
          }}
          placeholder={t("address.phParse")}
        />
        {parseResult && (
          <div className="mt-3 p-3 bg-slate-50 rounded text-sm space-y-1">
            <div><b>{t("address.region")}：</b>{(parseResult as any).province} {(parseResult as any).city} {(parseResult as any).district}</div>
            <div><b>{t("address.detail")}：</b>{(parseResult as any).detail}</div>
            <div className="text-xs text-slate-400">{t("address.confidence")}：{(parseResult as any).confidence}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
