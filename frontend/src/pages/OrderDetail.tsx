import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Descriptions, Tag, Button, Spin, message, Modal, Rate, Input, List } from "antd";
import { getOrder, transitionOrder, createProductReview, OrderOut } from "../api";
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

  const doAction = async (status: any) => {
    if (!order) return;
    setActing(true);
    try {
      await transitionOrder(order.id, status);
      message.success("操作成功");
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || "操作失败");
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
    } catch (e: any) {
      message.error(e.response?.data?.detail || "评价失败");
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
    </div>
  );
}
