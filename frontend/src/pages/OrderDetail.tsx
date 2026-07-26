import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { useParams, useNavigate } from "react-router-dom";
import {
  Card,
  Descriptions,
  Tag,
  Button,
  Spin,
  message,
  Modal,
  Rate,
  Input,
  List,
  Timeline,
} from "antd";
import {
  getOrder,
  transitionOrder,
  createProductReview,
  requestRefund,
  reviewRefund,
  getLogistics,
  addLogistics,
  OrderOut,
  OrderStatus,
  LogisticsEvent,
} from "../api";
import { money, orderStatusMeta, nextActions, actionLabel } from "../utils/format";
import { useAuth } from "../store/auth";

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [order, setOrder] = useState<OrderOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [reviewFor, setReviewFor] = useState<{ product_id: string; name: string } | null>(null);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [logData, setLogData] = useState<{ tracking_no?: string; events: LogisticsEvent[] }>({
    events: [],
  });
  const [logTrack, setLogTrack] = useState("");
  const [logDesc, setLogDesc] = useState("");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setOrder(await getOrder(id));
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [id]);

  const doAction = async (status: OrderStatus) => {
    if (!order) return;
    setActing(true);
    try {
      await transitionOrder(order.id, status);
      message.success("操作成功");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "操作失败");
    } finally {
      setActing(false);
    }
  };

  const submitReview = async () => {
    if (!reviewFor || !content.trim()) {
      message.warning("请填写评价内容");
      return;
    }
    try {
      await createProductReview(reviewFor.product_id, {
        order_id: order!.id,
        rating,
        content: content.trim(),
      });
      message.success("评价成功");
      setReviewFor(null);
      setContent("");
      setRating(5);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "评价失败");
    }
  };

  const submitRefund = async () => {
    if (!refundReason.trim() || !order) return;
    try {
      await requestRefund(order.id, refundReason.trim());
      message.success("退款申请已提交");
      setRefundOpen(false);
      setRefundReason("");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "申请失败");
    }
  };

  const doRefundReview = async (approve: boolean) => {
    if (!order) return;
    try {
      await reviewRefund(order.id, approve);
      message.success(approve ? "已同意退款" : "已拒绝退款");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "操作失败");
    }
  };

  const openLogistics = async () => {
    if (!order) return;
    try {
      const d = await getLogistics(order.id);
      setLogData(d);
      setLogOpen(true);
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "获取物流失败");
    }
  };

  const submitLogistics = async () => {
    if (!order || !logDesc.trim()) return;
    try {
      const d = await addLogistics(order.id, logTrack, {
        time: new Date().toLocaleString(),
        location: "",
        description: logDesc.trim(),
      });
      setLogData(d);
      setLogDesc("");
      message.success("物流已更新");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "录入失败");
    }
  };

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (!order) return <div className="text-center py-20">订单不存在</div>;

  const actions = user ? nextActions(order.status, user.role) : [];

  return (
    <div>
      <Button type="link" onClick={() => navigate(-1)}>
        ← 返回
      </Button>
      <Card title={`订单 ${order.order_no}`} className="mt-2">
        <Descriptions column={2}>
          <Descriptions.Item label="状态">
            <Tag color={orderStatusMeta[order.status].color}>
              {orderStatusMeta[order.status].label}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="金额">¥{money(order.total_amount)}</Descriptions.Item>
          {Number(order.discount_amount) > 0 && (
            <Descriptions.Item label="优惠">
              <Tag color="green">已省 ¥{money(order.discount_amount)}</Tag>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="收货地址">{order.address || "-"}</Descriptions.Item>
          <Descriptions.Item label="下单时间">
            {new Date(order.created_at).toLocaleString()}
          </Descriptions.Item>
        </Descriptions>
        <List
          dataSource={order.items}
          renderItem={(it) => (
            <List.Item
              actions={
                order.status === "completed"
                  ? [
                      <Button
                        type="link"
                        key="r"
                        onClick={() => setReviewFor({ product_id: it.product_id, name: it.name })}
                      >
                        评价
                      </Button>,
                    ]
                  : []
              }
            >
              <List.Item.Meta title={it.name} description={`¥${money(it.price)} × ${it.quantity}`} />
            </List.Item>
          )}
        />
        {actions.length > 0 && (
          <div className="mt-4 flex gap-3">
            {actions.map((a) => (
              <Button key={a} type="primary" loading={acting} onClick={() => doAction(a)}>
                {actionLabel[a]}
              </Button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {user?.role === "buyer" && ["paid", "shipped"].includes(order.status) && (
            <Button danger onClick={() => setRefundOpen(true)}>
              申请退款
            </Button>
          )}
          {user?.role === "buyer" &&
            ["shipped", "completed", "refund_requested", "refunded"].includes(order.status) && (
              <Button onClick={openLogistics}>查看物流</Button>
            )}
          {user?.role === "merchant" && order.status === "refund_requested" && (
            <>
              <Button type="primary" onClick={() => doRefundReview(true)}>
                同意退款
              </Button>
              <Button danger onClick={() => doRefundReview(false)}>
                拒绝退款
              </Button>
            </>
          )}
          {user?.role === "merchant" &&
            !["pending_payment", "completed"].includes(order.status) && (
              <Button onClick={() => setLogOpen(true)}>录入物流</Button>
            )}
        </div>
      </Card>

      <Modal
        title={`评价：${reviewFor?.name ?? ""}`}
        open={!!reviewFor}
        onCancel={() => setReviewFor(null)}
        onOk={submitReview}
        okText="提交"
      >
        <Rate value={rating} onChange={setRating} />
        <Input.TextArea
          rows={4}
          className="mt-3"
          placeholder="说说你的使用体验（1-1000 字）"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
        />
      </Modal>

      <Modal
        title="申请退款"
        open={refundOpen}
        onCancel={() => setRefundOpen(false)}
        onOk={submitRefund}
        okText="提交申请"
      >
        <Input.TextArea
          rows={4}
          placeholder="请说明退款原因"
          value={refundReason}
          onChange={(e) => setRefundReason(e.target.value)}
        />
      </Modal>

      <Modal title="物流追踪" open={logOpen} onCancel={() => setLogOpen(false)} footer={null}>
        {user?.role === "merchant" && (
          <div className="mb-3 flex gap-2">
            <Input
              placeholder="运单号"
              value={logTrack}
              onChange={(e) => setLogTrack(e.target.value)}
            />
            <Input
              placeholder="物流描述，如：已揽收"
              value={logDesc}
              onChange={(e) => setLogDesc(e.target.value)}
            />
            <Button type="primary" onClick={submitLogistics}>
              添加节点
            </Button>
          </div>
        )}
        {logData.tracking_no && (
          <div className="mb-2 text-slate-500">运单号：{logData.tracking_no}</div>
        )}
        {logData.events.length === 0 ? (
          <div className="text-slate-400">暂无物流信息</div>
        ) : (
          <Timeline
            items={logData.events.map((e) => ({
              children: (
                <div>
                  <div className="font-medium">{e.description}</div>
                  <div className="text-xs text-slate-400">
                    {e.location ? e.location + " · " : ""}
                    {e.time}
                  </div>
                </div>
              ),
            }))}
          />
        )}
      </Modal>
    </div>
  );
}
