import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Tag, Button, Empty, Spin, Card } from "antd";
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
  if (items.length === 0) return <Empty description="还没有订单" className="py-20" />;
  return (
    <Card title="我的订单">
      <Table
        dataSource={items}
        rowKey="id"
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
  );
}
