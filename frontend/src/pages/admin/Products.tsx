import { useEffect, useState } from "react";
import { Table, Button, Tag, message, Card, Select, Popconfirm, Spin } from "antd";
import { adminListProducts, setProductStatus, ProductOut, ProductStatus } from "../../api";
import { money, productStatusMeta } from "../../utils/format";

export default function AdminProducts() {
  const [items, setItems] = useState<ProductOut[]>([]);
  const [filter, setFilter] = useState<ProductStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      setItems(await adminListProducts(filter === "all" ? undefined : filter));
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [filter]);

  const approve = async (id: string) => {
    try {
      await setProductStatus(id, "active");
      message.success("已上架");
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || "操作失败");
    }
  };
  const reject = async (id: string) => {
    try {
      await setProductStatus(id, "rejected", "不符合平台规范");
      message.success("已驳回");
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || "操作失败");
    }
  };

  return (
    <Card
      title="商品审核"
      extra={
        <Select
          value={filter}
          style={{ width: 160 }}
          onChange={setFilter}
          options={[
            { value: "all", label: "全部" },
            { value: "pending", label: "待审核" },
            { value: "active", label: "已上架" },
            { value: "rejected", label: "已驳回" },
            { value: "draft", label: "草稿" },
          ]}
        />
      }
    >
      {loading ? (
        <div className="text-center py-10">
          <Spin />
        </div>
      ) : (
        <Table
          rowKey="id"
          dataSource={items}
          pagination={false}
          columns={[
            { title: "名称", dataIndex: "name" },
            { title: "价格", dataIndex: "price", render: (v) => `¥${money(v)}` },
            { title: "库存", dataIndex: "stock" },
            {
              title: "状态",
              dataIndex: "status",
              render: (s) => <Tag color={productStatusMeta[s].color}>{productStatusMeta[s].label}</Tag>,
            },
            { title: "驳回原因", dataIndex: "reject_reason", render: (v) => v || "-" },
            {
              title: "操作",
              render: (_, r) => (
                <span className="flex gap-1">
                  {r.status === "pending" && (
                    <Button type="link" onClick={() => approve(r.id)}>
                      通过
                    </Button>
                  )}
                  {(r.status === "pending" || r.status === "active") && (
                    <Popconfirm title="确认驳回？" onConfirm={() => reject(r.id)}>
                      <Button type="link" danger>
                        驳回
                      </Button>
                    </Popconfirm>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
