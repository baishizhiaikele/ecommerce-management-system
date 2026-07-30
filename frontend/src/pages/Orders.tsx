import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Tag, Button, Spin, Card } from "antd";
import EmptyState from "../components/EmptyState";
import { listOrders, OrderOut, OrderStatus } from "../api";
import { money, orderStatusMeta, formatDateTime } from "../utils/format";
import { useI18n } from "../i18n";

export default function Orders() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [items, setItems] = useState<OrderOut[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    listOrders()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (items.length === 0)
    return <EmptyState title={t("empty.orders")} description={t("empty.ordersDesc")} />;
  return (
    <div>
      <div className="section-title">
        <h2>{t("page.orders.title")}</h2>
      </div>
      <Card className="soft-card">
        <Table
          dataSource={items}
          rowKey="id"
          size="middle"
          columns={[
          { title: t("col.orderNo"), dataIndex: "order_no" },
          { title: t("col.amount"), dataIndex: "total_amount", render: (v) => `¥${money(v)}` },
          {
            title: t("common.status"),
            dataIndex: "status",
            render: (s: OrderStatus) => <Tag color={orderStatusMeta[s].color}>{orderStatusMeta[s].label}</Tag>,
          },
          {
            title: t("od.deliveryType"),
            dataIndex: "delivery_type",
            render: (v: string, r: OrderOut) => (
              <div>
                {r.delivery_type === "pickup" ? (
                  <Tag color="purple">{t("cart.deliveryPickup")}</Tag>
                ) : (
                  <Tag>{t("cart.deliveryExpress")}</Tag>
                )}
                <div className="text-xs text-gray-500 mt-0.5">
                  {r.delivery_type === "pickup"
                    ? r.pickup_store || "-"
                    : [r.receiver, r.address].filter(Boolean).join(" ") || "-"}
                </div>
              </div>
            ),
          },
          {
            title: t("col.createdAt"),
            dataIndex: "created_at",
            render: (v) => formatDateTime(v),
          },
          {
            title: t("common.action"),
            render: (_, r) => (
              <>
                <Button type="link" onClick={() => navigate(`/orders/${r.id}`)}>
                  {t("common.view")}
                </Button>
                {r.status === "pending_payment" && (
                  <Button type="link" onClick={() => navigate(`/pay/${r.id}`)}>
                    {t("order.next.pay")}
                  </Button>
                )}
              </>
            ),
          },
        ]}
      />
      </Card>
    </div>
  );
}
