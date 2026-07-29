import { useEffect, useState } from "react";
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Table, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import {
  createPresale,
  myPresales,
  myProducts,
  type PresaleOut,
  type ProductOut,
} from "../../api";
import { useI18n } from "../../i18n";
import { money } from "../../utils/format";

export default function MerchantPresales() {
  const { t } = useI18n();
  const [rows, setRows] = useState<PresaleOut[]>([]);
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [ps, prods] = await Promise.all([myPresales(), myProducts()]);
      setRows(ps);
      setProducts(prods);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    const v = await form.validateFields();
    try {
      await createPresale({
        product_id: v.product_id,
        title: v.title,
        presale_price: Number(v.presale_price),
        deposit: Number(v.deposit),
        inflate_rate: Number(v.inflate_rate ?? 1.5),
        end_at: v.end_at ? v.end_at.toISOString() : undefined,
      });
      message.success(t("ps.m.created"));
      setOpen(false);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    }
  };

  return (
    <Card
      className="soft-card"
      title={t("ps.m.title")}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          {t("ps.m.create")}
        </Button>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={rows}
        pagination={false}
        locale={{ emptyText: t("ps.m.empty") }}
        columns={[
          { title: t("ps.m.presaleTitle"), dataIndex: "title" },
          { title: t("ps.m.product"), dataIndex: "product_name" },
          {
            title: t("ps.m.price"),
            dataIndex: "presale_price",
            render: (v: string) => `¥${money(v)}`,
          },
          {
            title: t("ps.m.deposit"),
            render: (_: unknown, r: PresaleOut) =>
              `¥${money(r.deposit)} ×${r.inflate_rate} → ¥${r.deposit_deduction ?? "-"}`,
          },
          {
            title: t("ps.m.balance"),
            dataIndex: "balance_due",
            render: (v: number | null) => (v != null ? `¥${v.toFixed(2)}` : "-"),
          },
          {
            title: t("ps.m.endAt"),
            dataIndex: "end_at",
            render: (v: string | null) => (v ? dayjs(v).format("MM-DD HH:mm") : t("ps.m.noEnd")),
          },
        ]}
      />

      <Modal title={t("ps.m.create")} open={open} onOk={submit} onCancel={() => setOpen(false)} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ inflate_rate: 1.5 }}>
          <Form.Item name="title" label={t("ps.m.presaleTitle")} rules={[{ required: true, min: 2 }]}>
            <Input maxLength={100} placeholder={t("ps.m.titlePh")} />
          </Form.Item>
          <Form.Item name="product_id" label={t("ps.m.product")} rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t("mp.selectProduct")}
              options={products.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <div className="grid grid-cols-3 gap-3">
            <Form.Item name="presale_price" label={t("ps.m.price")} rules={[{ required: true }]}>
              <InputNumber className="w-full" min={0.01} precision={2} />
            </Form.Item>
            <Form.Item name="deposit" label={t("ps.m.depositAmount")} rules={[{ required: true }]}>
              <InputNumber className="w-full" min={0.01} precision={2} />
            </Form.Item>
            <Form.Item name="inflate_rate" label={t("ps.m.inflate")}>
              <InputNumber className="w-full" min={1} max={5} step={0.1} />
            </Form.Item>
          </div>
          <Form.Item name="end_at" label={t("ps.m.endAt")}>
            <DatePicker showTime className="w-full" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
