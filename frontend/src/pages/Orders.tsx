import { useNavigate } from "react-router-dom";
import { Table, Tag, Button, Card } from "antd";
import AsyncBoundary from "../components/AsyncBoundary";
import { useAsync } from "../hooks/useAsync";
import { listOrders, OrderOut, OrderStatus } from "../api";
import { money, orderStatusMeta, formatDateTime } from "../utils/format";
import { useI18n } from "../i18n";

export default function Orders() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data, loading, error, retry } = useAsync<OrderOut[]>(() => listOrders(), []);
  const items = data ?? [];
  return (
    <div>
      <div className="section-title">
        <h2>{t("page.orders.title")}</h2>
      </div>
      <AsyncBoundary
        loading={loading}
        error={error}
        retry={retry}
        isEmpty={items.length === 0}
        emptyTitle={t("empty.orders")}
        emptyDescription={t("empty.ordersDesc")}
        emptyAction={
          <Button type="primary" onClick={() => navigate("/market")}>
            {t("favorites.browse")}
          </Button>
        }
      >
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
      </AsyncBoundary>
    </div>
  );
}
