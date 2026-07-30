import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Button, Spin, Result, Typography, Descriptions, message } from "antd";
import { getOrder, confirmPayment, OrderOut } from "../api";
import { money, formatDateTime } from "../utils/format";
import { useI18n } from "../i18n";

const { Paragraph, Text } = Typography;

export default function Pay() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [order, setOrder] = useState<OrderOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!id) return;
    getOrder(id)
      .then(setOrder)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const onPay = async () => {
    if (!id) return;
    setPaying(true);
    try {
      await confirmPayment(id);
      setDone(true);
      message.success(t("pay.success"));
    } catch (e: unknown) {
      message.error((e as { message?: string })?.message || t("common.operationFailed"));
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="text-center py-20"><Spin /></div>;

  if (done) {
    return (
      <Result
        status="success"
        title={t("pay.success")}
        subTitle={t("pay.successSub")}
        extra={[
          <Button type="primary" key="detail" onClick={() => navigate(`/orders/${id}`)}>
            {t("common.view")}
          </Button>,
          <Button key="orders" onClick={() => navigate("/orders")}>
            {t("page.orders.title")}
          </Button>,
        ]}
      />
    );
  }

  if (!order) {
    return <Result status="warning" title={t("od.notFound")} extra={<Button onClick={() => navigate("/orders")}>{t("common.back")}</Button>} />;
  }

  if (order.status !== "pending_payment") {
    return (
      <Result
        status="info"
        title={t("pay.notNeeded")}
        subTitle={`${t("pay.currentStatus")}${order.status}`}
        extra={<Button type="primary" onClick={() => navigate(`/orders/${id}`)}>{t("common.view")}</Button>}
      />
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <Card className="rounded-2xl soft-card fade-up">
        <Typography.Title level={4} className="m-0 mb-4">{t("pay.title")}</Typography.Title>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label={t("pay.orderNo")}>{order.order_no}</Descriptions.Item>
          <Descriptions.Item label={t("pay.payable")}>
            <Text strong style={{ fontSize: 20, color: "#f5222d" }}>¥{money(order.total_amount)}</Text>
          </Descriptions.Item>
          {order.created_at && (
            <Descriptions.Item label={t("pay.orderTime")}>
              {formatDateTime(order.created_at)}
            </Descriptions.Item>
          )}
          {order.paid_at && (
            <Descriptions.Item label={t("pay.paidTime")}>
              {formatDateTime(order.paid_at)}
            </Descriptions.Item>
          )}
        </Descriptions>
        <Paragraph type="secondary" className="mt-3 mb-4 text-sm">
          {t("pay.sandboxNote")}
        </Paragraph>
        <div className="flex gap-2">
          <Button type="primary" block loading={paying} onClick={onPay}>
            {t("pay.confirmPay")} ¥{money(order.total_amount)}
          </Button>
          <Button onClick={() => navigate(`/orders/${id}`)}>{t("common.cancel")}</Button>
        </div>
      </Card>
    </div>
  );
}
