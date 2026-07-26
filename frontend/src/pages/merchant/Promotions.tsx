import { useEffect, useState } from "react";
import {
  Card,
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  DatePicker,
  Popconfirm,
  message,
  Space,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  myProducts,
  myPromotions,
  createPromotion,
  deletePromotion,
  type ProductOut,
  type PromotionOut,
  type PromotionType,
} from "../../api";

const TYPE_META: Record<PromotionType, { label: string; color: string }> = {
  flash: { label: "限时秒杀", color: "red" },
  discount: { label: "限时折扣", color: "orange" },
  full_reduce: { label: "满减优惠", color: "green" },
};

export default function MerchantPromotions() {
  const [promos, setPromos] = useState<PromotionOut[]>([]);
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [type, setType] = useState<PromotionType>("flash");

  const load = async () => {
    setLoading(true);
    try {
      const [ps, pr] = await Promise.all([myProducts(), myPromotions()]);
      setProducts(ps);
      setPromos(pr);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ type: "flash", is_active: true });
    setType("flash");
    setModalOpen(true);
  };

  const submit = async () => {
    const v = await form.validateFields();
    const payload: any = {
      title: v.title,
      type: v.type,
      product_id: v.product_id,
      is_active: v.is_active ?? true,
      start_at: v.start_at ? dayjs(v.start_at).toISOString() : undefined,
      end_at: v.end_at ? dayjs(v.end_at).toISOString() : undefined,
    };
    if (v.type === "flash") payload.discount_price = Number(v.discount_price || 0);
    if (v.type === "discount") payload.discount_rate = Number(v.discount_rate || 1);
    if (v.type === "full_reduce") payload.discount_price = Number(v.discount_price || 0);
    try {
      await createPromotion(payload);
      message.success("活动已创建");
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "创建失败");
    }
  };

  const remove = async (id: string) => {
    try {
      await deletePromotion(id);
      message.success("已删除");
      load();
    } catch {
      message.error("删除失败");
    }
  };

  const columns = [
    {
      title: "活动",
      dataIndex: "title",
      render: (t: string, r: PromotionOut) => (
        <Space direction="vertical" size={0}>
          <span className="font-medium">{t}</span>
          <Tag color={TYPE_META[r.type].color} className="!mt-1">
            {TYPE_META[r.type].label}
          </Tag>
        </Space>
      ),
    },
    { title: "商品", dataIndex: "product_name", render: (t: string) => t || "-" },
    {
      title: "优惠",
      render: (_: unknown, r: PromotionOut) =>
        r.discount_price != null
          ? `¥${r.discount_price}`
          : r.discount_rate != null
          ? `${(Number(r.discount_rate) * 10).toFixed(1)} 折`
          : "—",
    },
    {
      title: "时间",
      render: (_: unknown, r: PromotionOut) => (
        <span className="text-xs text-slate-400">
          {r.start_at ? dayjs(r.start_at).format("MM-DD HH:mm") : "即日"} ~{" "}
          {r.end_at ? dayjs(r.end_at).format("MM-DD HH:mm") : "长期"}
        </span>
      ),
    },
    {
      title: "状态",
      dataIndex: "is_active",
      render: (a: boolean) => <Tag color={a ? "green" : "default"}>{a ? "进行中" : "已停用"}</Tag>,
    },
    {
      title: "操作",
      render: (_: unknown, r: PromotionOut) => (
        <Popconfirm title="确认删除该活动？" onConfirm={() => remove(r.id)}>
          <Button danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card
      title="营销活动"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          创建活动
        </Button>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={promos}
        pagination={false}
        locale={{ emptyText: "还没有活动，点击右上角创建" }}
      />

      <Modal
        title="创建营销活动"
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="product_id" label="商品" rules={[{ required: true, message: "请选择商品" }]}>
            <Select
              showSearch
              placeholder="选择参与活动的商品"
              optionFilterProp="label"
              options={products.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="type" label="活动类型" rules={[{ required: true }]}>
            <Select
              onChange={(v) => setType(v)}
              options={[
                { value: "flash", label: "限时秒杀" },
                { value: "discount", label: "限时折扣" },
                { value: "full_reduce", label: "满减优惠" },
              ]}
            />
          </Form.Item>
          <Form.Item name="title" label="活动标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input placeholder="如：双十一秒杀" />
          </Form.Item>
          {type === "flash" && (
            <Form.Item name="discount_price" label="秒杀价" rules={[{ required: true, message: "请输入秒杀价" }]}>
              <InputNumber className="w-full" min={0} precision={2} />
            </Form.Item>
          )}
          {type === "discount" && (
            <Form.Item name="discount_rate" label="折扣（如 0.8 表示 8 折）" rules={[{ required: true }]}>
              <InputNumber className="w-full" min={0.1} max={1} step={0.05} precision={2} />
            </Form.Item>
          )}
          {type === "full_reduce" && (
            <Form.Item name="discount_price" label="立减金额">
              <InputNumber className="w-full" min={0} precision={2} />
            </Form.Item>
          )}
          <Form.Item label="起止时间（可选）">
            <Space>
              <Form.Item name="start_at" noStyle>
                <DatePicker showTime placeholder="开始" />
              </Form.Item>
              <Form.Item name="end_at" noStyle>
                <DatePicker showTime placeholder="结束" />
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item name="is_active" label="立即生效" initialValue={true}>
            <Select
              options={[
                { value: true, label: "是" },
                { value: false, label: "否（暂存草稿）" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
