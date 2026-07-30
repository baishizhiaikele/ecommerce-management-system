import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import {
  Table,
  Button,
  Tag,
  message,
  Card,
  Space,
  Popconfirm,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Switch,
  Spin,
} from "antd";
import type { TableColumnsType } from "antd";
import dayjs, { Dayjs } from "dayjs";
import {
  adminCoupons,
  merchantCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  CouponOut,
  CouponCreate,
} from "../api";
import { money } from "../utils/format";
import { useI18n } from "../i18n";

export default function CouponManager({ mode }: { mode: "admin" | "merchant" }) {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<CouponOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CouponOut | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const renderValue = (r: CouponOut) => {
    if (r.type === "discount") {
      return lang === "zh"
        ? `${(Number(r.value) * 10).toFixed(1)}折`
        : `${Math.round((1 - Number(r.value)) * 100)}% OFF`;
    }
    return t("coupon.full", { min: money(r.threshold), val: money(r.value) });
  };
  const renderPeriod = (r: CouponOut) => {
    const expire = r.expire_at || r.end_at;
    if (!expire) return t("coupon.permanent");
    return `${t("coupon.expireAt")}：${dayjs(expire).format("YYYY-MM-DD")}`;
  };

  const load = async () => {
    setLoading(true);
    try {
      setItems(mode === "admin" ? await adminCoupons() : await merchantCoupons());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [mode]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      type: "full_reduce",
      threshold: 0,
      total: 0,
      is_active: true,
    });
    setOpen(true);
  };
  const openEdit = (r: CouponOut) => {
    setEditing(r);
    form.setFieldsValue({
      name: r.name,
      type: r.type,
      threshold: Number(r.threshold),
      value: Number(r.value),
      total: r.total ?? 0,
      is_active: r.is_active,
      start_at: r.start_at ? dayjs(r.start_at) : null,
      end_at: r.end_at ? dayjs(r.end_at) : null,
      expire_at: r.expire_at ? dayjs(r.expire_at) : null,
    });
    setOpen(true);
  };
  const onSubmit = async () => {
    const v = await form.validateFields();
    const payload: CouponCreate = {
      name: v.name,
      type: v.type,
      threshold: v.type === "full_reduce" ? Number(v.threshold || 0) : 0,
      value: Number(v.value),
      total: Number(v.total || 0),
      is_active: v.is_active,
      start_at: v.start_at ? (v.start_at as Dayjs).toISOString() : null,
      end_at: v.end_at ? (v.end_at as Dayjs).toISOString() : null,
      expire_at: v.expire_at ? (v.expire_at as Dayjs).toISOString() : null,
    };
    if (mode === "admin" && v.merchant_id) payload.merchant_id = v.merchant_id;
    setSaving(true);
    try {
      if (editing) {
        await updateCoupon(editing.id, payload);
        message.success(t("common.updated"));
      } else {
        await createCoupon(payload);
        message.success(t("common.created"));
      }
      setOpen(false);
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    } finally {
      setSaving(false);
    }
  };
  const onDelete = async (id: string) => {
    try {
      await deleteCoupon(id);
      message.success(t("coupon.delisted"));
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("coupon.delFail"));
    }
  };
  const onToggleActive = async (r: CouponOut, checked: boolean) => {
    try {
      await updateCoupon(r.id, { is_active: checked });
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const columns: TableColumnsType<CouponOut> = [
    { title: t("col.name"), dataIndex: "name" },
    {
      title: t("coupon.scope"),
      render: (_: unknown, r: CouponOut) =>
        r.merchant_id ? <Tag color="blue">{t("coupon.shopCoupon")}</Tag> : <Tag color="purple">{t("coupon.platformCoupon")}</Tag>,
    },
    { title: t("mp.discount"), render: (_: unknown, r: CouponOut) => renderValue(r) },
    {
      title: t("coupon.issued"),
      render: (_: unknown, r: CouponOut) => `${r.issued ?? 0} / ${r.total || t("coupon.unlimited")}`,
    },
    { title: t("coupon.validity"), render: (_: unknown, r: CouponOut) => renderPeriod(r) },
    {
      title: t("common.status"),
      render: (_: unknown, r: CouponOut) => (
        <Switch checked={r.is_active} onChange={(c) => onToggleActive(r, c)} />
      ),
    },
    {
      title: t("common.action"),
      render: (_: unknown, r: CouponOut) => (
        <Space>
          <Button type="link" onClick={() => openEdit(r)}>
            {t("common.edit")}
          </Button>
          <Popconfirm title={t("coupon.confirmDel")} onConfirm={() => onDelete(r.id)}>
            <Button type="link" danger>
              {t("coupon.delist")}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={mode === "admin" ? t("coupon.adminTitle") : t("coupon.myTitle")}
      className="soft-card"
      extra={
        <Button type="primary" onClick={openCreate}>
          {t("coupon.create")}
        </Button>
      }
    >
      {loading ? (
        <div className="text-center py-10">
          <Spin />
        </div>
      ) : (
        <Table rowKey="id" dataSource={items} pagination={false} columns={columns} />
      )}
      <Drawer
        title={editing ? t("coupon.edit") : t("coupon.create")}
        open={open}
        onClose={() => setOpen(false)}
        width={420}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item name="name" label={t("coupon.name")} rules={[{ required: true, message: t("mprod.reqName") }]}>
            <Input placeholder={t("coupon.namePlaceholder")} />
          </Form.Item>
          <Form.Item name="type" label={t("common.type")} rules={[{ required: true }]}>
            <Select
              options={[
                { value: "full_reduce", label: t("coupon.fullReduce") },
                { value: "discount", label: t("coupon.discount") },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.type !== c.type}>
            {({ getFieldValue }) =>
              getFieldValue("type") === "full_reduce" ? (
                <Form.Item name="threshold" label={t("coupon.threshold")}>
                  <InputNumber min={0} className="w-full" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item
            name="value"
            label={t("coupon.value")}
            rules={[{ required: true, message: t("coupon.valuePlaceholder") }]}
          >
            <InputNumber min={0} step={0.1} className="w-full" />
          </Form.Item>
          <Form.Item name="total" label={t("coupon.total")}>
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          {mode === "admin" && (
            <Form.Item name="merchant_id" label={t("coupon.owner")} tooltip={t("coupon.ownerTip")}>
              <Input placeholder={t("coupon.ownerPlaceholder")} />
            </Form.Item>
          )}
          <Form.Item name="start_at" label={t("coupon.startTime")}>
            <DatePicker showTime className="w-full" />
          </Form.Item>
          <Form.Item name="end_at" label={t("coupon.endTime")}>
            <DatePicker showTime className="w-full" />
          </Form.Item>
          <Form.Item
            name="expire_at"
            label={t("coupon.expireAt")}
            tooltip={t("coupon.expireTip")}
          >
            <DatePicker showTime className="w-full" />
          </Form.Item>
          <Form.Item name="is_active" label={t("coupon.enableNow")} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>
            {t("common.save")}
          </Button>
        </Form>
      </Drawer>
    </Card>
  );
}
