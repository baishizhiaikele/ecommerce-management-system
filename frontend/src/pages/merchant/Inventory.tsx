import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import {
  Table,
  Button,
  Tag,
  message,
  Modal,
  Form,
  InputNumber,
  Input,
  Select,
  Card,
  Statistic,
} from "antd";
import { WarningOutlined } from "@ant-design/icons";
import {
  inventorySummary,
  inventoryLowStock,
  inventoryLogs,
  adjustStock,
  myProducts,
  StockSummaryOut,
  StockLogOut,
  ProductOut,
} from "../../api";
import { useI18n, translate } from "../../i18n";

const changeMeta: Record<string, { labelKey: string; color: string }> = {
  restock: { labelKey: "inv.restock", color: "green" },
  adjust: { labelKey: "inv.adjust", color: "blue" },
  order_cancel: { labelKey: "inv.orderCancel", color: "default" },
  sale: { labelKey: "inv.sale", color: "red" },
  manual: { labelKey: "inv.manual", color: "orange" },
};

export default function MerchantInventory() {
  const { t } = useI18n();
  const [summary, setSummary] = useState<StockSummaryOut | null>(null);
  const [low, setLow] = useState<any[]>([]);
  const [logs, setLogs] = useState<StockLogOut[]>([]);
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [s, l, g, p] = await Promise.all([
        inventorySummary(),
        inventoryLowStock(),
        inventoryLogs(),
        myProducts(),
      ]);
      setSummary(s);
      setLow(l);
      setLogs(g);
      setProducts(p);
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
      await adjustStock(v.product_id, v.quantity, v.change_type, v.remark);
      message.success(t("inv.adjusted"));
      setModal(false);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("inv.adjustFail"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <Statistic title={t("inv.statSku")} value={summary?.total_skus ?? 0} />
        </Card>
        <Card>
          <Statistic title={t("inv.statLow")} value={summary?.low_stock_count ?? 0} valueStyle={{ color: "#F97316" }} />
        </Card>
        <Card>
          <Statistic title={t("inv.statOut")} value={summary?.out_of_stock_count ?? 0} valueStyle={{ color: "#EF4444" }} />
        </Card>
        <Card>
          <Statistic title={t("inv.statRecent")} value={summary?.recent_changes ?? 0} />
        </Card>
      </div>

      <Card
        title={
          <span>
            <WarningOutlined className="text-[#F97316] mr-2" />
            {t("inv.lowWarn")}
          </span>
        }
      >
        {low.length === 0 ? (
          <div className="text-slate-400 py-6 text-center">{t("inv.healthy")}</div>
        ) : (
          <Table
            rowKey="id"
            dataSource={low}
            pagination={false}
            columns={[
              { title: t("inv.product"), dataIndex: "name" },
              { title: t("inv.currentStock"), dataIndex: "stock" },
              {
                title: t("common.action"),
                render: (_, r) => (
                  <Button
                    type="link"
                    onClick={() => {
                      form.setFieldsValue({ product_id: r.id, quantity: 10, change_type: "restock" });
                      setModal(true);
                    }}
                  >
                    {t("inv.replenish")}
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card
        title={t("inv.flow")}
        extra={
          <Button
            type="primary"
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ change_type: "restock" });
              setModal(true);
            }}
          >
            {t("inv.inbound")}
          </Button>
        }
      >
        <Table
          rowKey="id"
          dataSource={logs}
          loading={loading}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: t("inv.time"),
              dataIndex: "created_at",
              render: (v) => new Date(v).toLocaleString(),
            },
            { title: t("inv.product"), dataIndex: "product_name" },
            {
              title: t("inv.type"),
              dataIndex: "change_type",
              render: (ty) => <Tag color={changeMeta[ty]?.color}>{translate(changeMeta[ty]?.labelKey) || ty}</Tag>,
            },
            {
              title: t("inv.change"),
              dataIndex: "quantity",
              render: (v) => (
                <span style={{ color: v < 0 ? "#EF4444" : "#16A34A" }}>{v > 0 ? `+${v}` : v}</span>
              ),
            },
            { title: t("inv.balance"), dataIndex: "balance_after" },
            { title: t("inv.note"), dataIndex: "remark" },
          ]}
        />
      </Card>

      <Modal
        title={t("inv.adjustModalTitle")}
        open={modal}
        onOk={submit}
        onCancel={() => setModal(false)}
        okText={t("common.submit")}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="product_id" label={t("inv.product")} rules={[{ required: true, message: t("inv.reqProduct") }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={products.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="change_type" label={t("inv.changeType")} initialValue="restock" rules={[{ required: true }]}>
            <Select options={Object.entries(changeMeta).map(([k, v]) => ({ value: k, label: translate(v.labelKey) }))} />
          </Form.Item>
          <Form.Item
            name="quantity"
            label={t("inv.qtyDesc")}
            rules={[{ required: true, message: t("inv.reqQty") }]}
          >
            <InputNumber className="w-full" />
          </Form.Item>
          <Form.Item name="remark" label={t("inv.note")}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
