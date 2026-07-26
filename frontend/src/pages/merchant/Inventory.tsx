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

const changeMeta: Record<string, { label: string; color: string }> = {
  restock: { label: "采购入库", color: "green" },
  adjust: { label: "盘点调整", color: "blue" },
  order_cancel: { label: "订单取消回补", color: "default" },
  sale: { label: "销售扣减", color: "red" },
  manual: { label: "手动修正", color: "orange" },
};

export default function MerchantInventory() {
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
      message.success("库存已调整");
      setModal(false);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "调整失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <Statistic title="在售 SKU" value={summary?.total_skus ?? 0} />
        </Card>
        <Card>
          <Statistic title="低库存" value={summary?.low_stock_count ?? 0} valueStyle={{ color: "#F97316" }} />
        </Card>
        <Card>
          <Statistic title="缺货" value={summary?.out_of_stock_count ?? 0} valueStyle={{ color: "#EF4444" }} />
        </Card>
        <Card>
          <Statistic title="近7天变动" value={summary?.recent_changes ?? 0} />
        </Card>
      </div>

      <Card
        title={
          <span>
            <WarningOutlined className="text-[#F97316] mr-2" />
            低库存预警
          </span>
        }
      >
        {low.length === 0 ? (
          <div className="text-slate-400 py-6 text-center">暂无低库存商品，库存健康 🎉</div>
        ) : (
          <Table
            rowKey="id"
            dataSource={low}
            pagination={false}
            columns={[
              { title: "商品", dataIndex: "name" },
              { title: "当前库存", dataIndex: "stock" },
              {
                title: "操作",
                render: (_, r) => (
                  <Button
                    type="link"
                    onClick={() => {
                      form.setFieldsValue({ product_id: r.id, quantity: 10, change_type: "restock" });
                      setModal(true);
                    }}
                  >
                    补货
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>

      <Card
        title="库存流水"
        extra={
          <Button
            type="primary"
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ change_type: "restock" });
              setModal(true);
            }}
          >
            入库 / 调整
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
              title: "时间",
              dataIndex: "created_at",
              render: (v) => new Date(v).toLocaleString(),
            },
            { title: "商品", dataIndex: "product_name" },
            {
              title: "类型",
              dataIndex: "change_type",
              render: (t) => <Tag color={changeMeta[t]?.color}>{changeMeta[t]?.label || t}</Tag>,
            },
            {
              title: "变动",
              dataIndex: "quantity",
              render: (v) => (
                <span style={{ color: v < 0 ? "#EF4444" : "#16A34A" }}>{v > 0 ? `+${v}` : v}</span>
              ),
            },
            { title: "结余", dataIndex: "balance_after" },
            { title: "备注", dataIndex: "remark" },
          ]}
        />
      </Card>

      <Modal
        title="入库 / 库存调整"
        open={modal}
        onOk={submit}
        onCancel={() => setModal(false)}
        okText="提交"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="product_id" label="商品" rules={[{ required: true, message: "请选择商品" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={products.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="change_type" label="变动类型" initialValue="restock" rules={[{ required: true }]}>
            <Select options={Object.entries(changeMeta).map(([k, v]) => ({ value: k, label: v.label }))} />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="变动数量（正数入库 / 负数出库）"
            rules={[{ required: true, message: "请输入数量" }]}
          >
            <InputNumber className="w-full" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
