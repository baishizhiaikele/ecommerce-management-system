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
import { useI18n, translate } from "../../i18n";

const TYPE_META: Record<PromotionType, { labelKey: string; color: string }> = {
  flash: { labelKey: "mp.typeFlash", color: "red" },
  discount: { labelKey: "mp.typeDiscount", color: "orange" },
  full_reduce: { labelKey: "mp.typeFull", color: "green" },
};

export default function MerchantPromotions() {
  const { t, lang } = useI18n();
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
      message.success(t("mp.created"));
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("mp.createFail"));
    }
  };

  const remove = async (id: string) => {
    try {
      await deletePromotion(id);
      message.success(t("common.deleted"));
      load();
    } catch {
      message.error(t("mp.deleteFail"));
    }
  };

  const columns = [
    {
      title: t("mp.activity"),
      dataIndex: "title",
      render: (title: string, r: PromotionOut) => (
        <Space direction="vertical" size={0}>
          <span className="font-medium">{title}</span>
          <Tag color={TYPE_META[r.type].color} className="!mt-1">
            {translate(TYPE_META[r.type].labelKey)}
          </Tag>
        </Space>
      ),
    },
    { title: t("col.product"), dataIndex: "product_name", render: (title: string) => title || "-" },
    {
      title: t("mp.discount"),
      render: (_: unknown, r: PromotionOut) =>
        r.discount_price != null
          ? `¥${r.discount_price}`
          : r.discount_rate != null
          ? lang === "zh"
            ? `${(Number(r.discount_rate) * 10).toFixed(1)} 折`
            : `${Math.round((1 - Number(r.discount_rate)) * 100)}% OFF`
          : "—",
    },
    {
      title: t("mp.time"),
      render: (_: unknown, r: PromotionOut) => (
        <span className="text-xs text-slate-400">
          {r.start_at ? dayjs(r.start_at).format("MM-DD HH:mm") : t("mp.fromToday")} ~{" "}
          {r.end_at ? dayjs(r.end_at).format("MM-DD HH:mm") : t("mp.longTerm")}
        </span>
      ),
    },
    {
      title: t("common.status"),
      dataIndex: "is_active",
      render: (a: boolean) => (
        <Tag color={a ? "green" : "default"}>{a ? t("mp.active") : t("mp.stopped")}</Tag>
      ),
    },
    {
      title: t("common.action"),
      render: (_: unknown, r: PromotionOut) => (
        <Popconfirm title={t("mp.confirmDelete")} onConfirm={() => remove(r.id)}>
          <Button danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card
      title={t("page.merchant.promotions")}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t("mp.create")}
        </Button>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={promos}
        pagination={false}
        locale={{ emptyText: t("mp.empty") }}
      />

      <Modal
        title={t("mp.create")}
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        okText={t("mp.createBtn")}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="product_id" label={t("col.product")} rules={[{ required: true, message: t("inv.reqProduct") }]}>
            <Select
              showSearch
              placeholder={t("mp.selectProduct")}
              optionFilterProp="label"
              options={products.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="type" label={t("common.type")} rules={[{ required: true }]}>
            <Select
              onChange={(v) => setType(v)}
              options={[
                { value: "flash", label: translate("mp.typeFlash") },
                { value: "discount", label: translate("mp.typeDiscount") },
                { value: "full_reduce", label: translate("mp.typeFull") },
              ]}
            />
          </Form.Item>
          <Form.Item name="title" label={t("mp.name")} rules={[{ required: true, message: t("mp.reqTitle") }]}>
            <Input placeholder={t("mp.titlePlaceholder")} />
          </Form.Item>
          {type === "flash" && (
            <Form.Item name="discount_price" label={t("mp.discountPrice")} rules={[{ required: true, message: t("mp.reqPrice") }]}>
              <InputNumber className="w-full" min={0} precision={2} />
            </Form.Item>
          )}
          {type === "discount" && (
            <Form.Item name="discount_rate" label={t("mp.discountRate")} rules={[{ required: true }]}>
              <InputNumber className="w-full" min={0.1} max={1} step={0.05} precision={2} />
            </Form.Item>
          )}
          {type === "full_reduce" && (
            <Form.Item name="discount_price" label={t("mp.reduceAmount")}>
              <InputNumber className="w-full" min={0} precision={2} />
            </Form.Item>
          )}
          <Form.Item label={t("mp.optionalTime")}>
            <Space>
              <Form.Item name="start_at" noStyle>
                <DatePicker showTime placeholder={t("mp.start")} />
              </Form.Item>
              <Form.Item name="end_at" noStyle>
                <DatePicker showTime placeholder={t("mp.end")} />
              </Form.Item>
            </Space>
          </Form.Item>
          <Form.Item name="is_active" label={t("mp.immediate")} initialValue={true}>
            <Select
              options={[
                { value: true, label: t("common.yes") },
                { value: false, label: t("mp.noDraft") },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
