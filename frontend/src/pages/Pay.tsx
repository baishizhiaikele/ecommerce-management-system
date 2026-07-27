import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Button, Spin, Result, Typography, Descriptions, message } from "antd";
import { getOrder, confirmPayment, OrderOut } from "../api";
import { money } from "../utils/format";

const { Paragraph, Text } = Typography;

export default function Pay() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
      message.success("支付成功");
    } catch (e: unknown) {
      message.error((e as { message?: string })?.message || "支付失败");
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="text-center py-20"><Spin /></div>;

  if (done) {
    return (
      <Result
        status="success"
        title="支付成功"
        subTitle="订单已支付，商家将尽快为你发货"
        extra={[
          <Button type="primary" key="detail" onClick={() => navigate(`/orders/${id}`)}>
            查看订单
          </Button>,
          <Button key="orders" onClick={() => navigate("/orders")}>
            我的订单
          </Button>,
        ]}
      />
    );
  }

  if (!order) {
    return <Result status="warning" title="订单不存在" extra={<Button onClick={() => navigate("/orders")}>返回订单</Button>} />;
  }

  if (order.status !== "pending_payment") {
    return (
      <Result
        status="info"
        title="该订单无需支付"
        subTitle={`当前状态：${order.status}`}
        extra={<Button type="primary" onClick={() => navigate(`/orders/${id}`)}>查看订单</Button>}
      />
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <Card className="rounded-2xl soft-card fade-up">
        <Typography.Title level={4} className="m-0 mb-4">订单支付</Typography.Title>
        <Descriptions column={1} bordered size="small">
          <Descriptions.Item label="订单号">{order.order_no}</Descriptions.Item>
          <Descriptions.Item label="应付金额">
            <Text strong style={{ fontSize: 20, color: "#f5222d" }}>¥{money(order.total_amount)}</Text>
          </Descriptions.Item>
        </Descriptions>
        <Paragraph type="secondary" className="mt-3 mb-4 text-sm">
          沙箱支付网关：点击下方按钮即模拟网关回调完成支付（生产环境由真实支付网关异步通知）。
        </Paragraph>
        <div className="flex gap-2">
          <Button type="primary" block loading={paying} onClick={onPay}>
            确认支付 ¥{money(order.total_amount)}
          </Button>
          <Button onClick={() => navigate(`/orders/${id}`)}>取消</Button>
        </div>
      </Card>
    </div>
  );
}
