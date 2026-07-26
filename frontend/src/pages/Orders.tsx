import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Tag, Button, Spin, Card } from "antd";
import EmptyState from "../components/EmptyState";
import { listOrders, OrderOut } from "../api";
import { money, orderStatusMeta } from "../utils/format";

export default function Orders() {
  const navigate = useNavigate();
  const [items, setItems] = useState<OrderOut[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listOrders()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (items.length === 0) return <EmptyState title="还没有订单" description="下单后订单会显示在这里" />;
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-6 rounded bg-slate-300" />
        <h2 className="text-xl font-bold m-0">我的订单</h2>
      </div>
      <Card className="soft-card">
        <Table
          dataSource={items}
          rowKey="id"
          size="middle"
          columns={[
          { title: "订单号", dataIndex: "order_no" },
          { title: "金额", dataIndex: "total_amount", render: (v) => `¥${money(v)}` },
          {
            title: "状态",
            dataIndex: "status",
            render: (s) => <Tag color={orderStatusMeta[s].color}>{orderStatusMeta[s].label}</Tag>,
          },
          {
            title: "下单时间",
            dataIndex: "created_at",
            render: (v) => new Date(v).toLocaleString(),
          },
          {
            title: "操作",
            render: (_, r) => (
              <Button type="link" onClick={() => navigate(`/orders/${r.id}`)}>
                查看
              </Button>
            ),
          },
        ]}
      />
      </Card>
    </div>
  );
}
