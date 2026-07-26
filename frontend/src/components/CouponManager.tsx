import { useEffect, useState } from "react";
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
import dayjs, { Dayjs } from "dayjs";
import {
  adminCoupons,
  merchantCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  CouponOut,
} from "../api";
import { money } from "../utils/format";

function renderValue(r: CouponOut) {
  if (r.type === "discount") return `${(Number(r.value) * 10).toFixed(1)}折`;
  return `满${money(r.threshold)}减${money(r.value)}`;
}
function renderPeriod(r: CouponOut) {
  if (!r.start_at && !r.end_at) return "长期有效";
  const s = r.start_at ? dayjs(r.start_at).format("YYYY-MM-DD HH:mm") : "—";
  const e = r.end_at ? dayjs(r.end_at).format("YYYY-MM-DD HH:mm") : "—";
  return `${s} ~ ${e}`;
}

export default function CouponManager({ mode }: { mode: "admin" | "merchant" }) {
  const [items, setItems] = useState<CouponOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CouponOut | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

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
    });
    setOpen(true);
  };
  const onSubmit = async () => {
    const v = await form.validateFields();
    const payload: Record<string, unknown> = {
      name: v.name,
      type: v.type,
      threshold: v.type === "full_reduce" ? Number(v.threshold || 0) : 0,
      value: Number(v.value),
      total: Number(v.total || 0),
      is_active: v.is_active,
      start_at: v.start_at ? (v.start_at as Dayjs).toISOString() : null,
      end_at: v.end_at ? (v.end_at as Dayjs).toISOString() : null,
    };
    if (mode === "admin" && v.merchant_id) payload.merchant_id = v.merchant_id;
    setSaving(true);
    try {
      if (editing) {
        await updateCoupon(editing.id, payload);
        message.success("已更新");
      } else {
        await createCoupon(payload as any);
        message.success("已创建");
      }
      setOpen(false);
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || "操作失败");
    } finally {
      setSaving(false);
    }
  };
  const onDelete = async (id: string) => {
    try {
      await deleteCoupon(id);
      message.success("已下架");
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || "下架失败");
    }
  };
  const onToggleActive = async (r: CouponOut, checked: boolean) => {
    try {
      await updateCoupon(r.id, { is_active: checked });
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || "操作失败");
    }
  };

  const columns = [
    { title: "名称", dataIndex: "name" },
    {
      title: "范围",
      render: (_: unknown, r: CouponOut) =>
        r.merchant_id ? <Tag color="blue">店铺券</Tag> : <Tag color="purple">平台券</Tag>,
    },
    { title: "优惠", render: (_: unknown, r: CouponOut) => renderValue(r) },
    {
      title: "发放 / 总量",
      render: (_: unknown, r: CouponOut) => `${r.issued ?? 0} / ${r.total || "不限"}`,
    },
    { title: "有效期", render: (_: unknown, r: CouponOut) => renderPeriod(r) },
    {
      title: "状态",
      render: (_: unknown, r: CouponOut) => (
        <Switch checked={r.is_active} onChange={(c) => onToggleActive(r, c)} />
      ),
    },
    {
      title: "操作",
      render: (_: unknown, r: CouponOut) => (
        <Space>
          <Button type="link" onClick={() => openEdit(r)}>
            编辑
          </Button>
          <Popconfirm title="确认下架该券？" onConfirm={() => onDelete(r.id)}>
            <Button type="link" danger>
              下架
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={mode === "admin" ? "优惠券管理（平台）" : "我的优惠券"}
      className="soft-card"
      extra={
        <Button type="primary" onClick={openCreate}>
          新建优惠券
        </Button>
      }
    >
      {loading ? (
        <div className="text-center py-10">
          <Spin />
        </div>
      ) : (
        <Table rowKey="id" dataSource={items} pagination={false} columns={columns as any} />
      )}
      <Drawer
        title={editing ? "编辑优惠券" : "新建优惠券"}
        open={open}
        onClose={() => setOpen(false)}
        width={420}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onSubmit}>
          <Form.Item name="name" label="券名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="如：新人专享券" />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "full_reduce", label: "满减券" },
                { value: "discount", label: "折扣券" },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.type !== c.type}>
            {({ getFieldValue }) =>
              getFieldValue("type") === "full_reduce" ? (
                <Form.Item name="threshold" label="使用门槛（满 X 元）">
                  <InputNumber min={0} className="w-full" />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item
            name="value"
            label="优惠值（满减=减免金额；折扣=系数，0.8 即 8 折）"
            rules={[{ required: true, message: "请输入优惠值" }]}
          >
            <InputNumber min={0} step={0.1} className="w-full" />
          </Form.Item>
          <Form.Item name="total" label="发行总量（0 表示不限量）">
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          {mode === "admin" && (
            <Form.Item
              name="merchant_id"
              label="归属商家 ID（留空=平台券；填商家 ID=店铺券）"
              tooltip="商家视角无需填写，自动归属本人"
            >
              <Input placeholder="留空表示平台券" />
            </Form.Item>
          )}
          <Form.Item name="start_at" label="生效时间">
            <DatePicker showTime className="w-full" />
          </Form.Item>
          <Form.Item name="end_at" label="失效时间">
            <DatePicker showTime className="w-full" />
          </Form.Item>
          <Form.Item name="is_active" label="立即启用" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} block>
            保存
          </Button>
        </Form>
      </Drawer>
    </Card>
  );
}
