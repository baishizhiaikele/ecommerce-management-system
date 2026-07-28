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
  returnShip,
  confirmReturnReceived,
  requestExchange,
  openDispute,
  reviewDispute,
  getLogistics,
  addLogistics,
  OrderOut,
  OrderStatus,
  LogisticsEvent,
} from "../api";
import { money, orderStatusMeta, nextActions, actionLabel, escrowMeta } from "../utils/format";
import { getPaymentStatus, PaymentStatus } from "../api";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const { t } = useI18n();
  const [order, setOrder] = useState<OrderOut | null>(null);
  const [escrow, setEscrow] = useState<PaymentStatus | null>(null);
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
  const [returnShipOpen, setReturnShipOpen] = useState(false);
  const [returnTrackingNo, setReturnTrackingNo] = useState("");
  const [returnCarrier, setReturnCarrier] = useState("");
  const [returnShipNote, setReturnShipNote] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      setOrder(await getOrder(id));
      setEscrow(await getPaymentStatus(id));
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
      message.success(t("common.opSuccess"));
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
      message.warning(t("od.reviewRequired"));
      return;
    }
    try {
      await createProductReview(reviewFor.product_id, {
        order_id: order!.id,
        rating,
        content: content.trim(),
      });
      message.success(t("od.reviewSuccess"));
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
      message.success(t("od.refundSubmitted"));
      setRefundOpen(false);
      setRefundReason("");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("od.applyFail"));
    }
  };

  const doRefundReview = async (approve: boolean) => {
    if (!order) return;
    try {
      await reviewRefund(order.id, approve);
      message.success(approve ? t("od.approveRefund") : t("od.rejectRefund"));
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "操作失败");
    }
  };

  const submitReturnShip = async () => {
    if (!order || !returnTrackingNo.trim() || !returnCarrier.trim()) return;
    try {
      await returnShip(order.id, {
        tracking_no: returnTrackingNo.trim(),
        carrier: returnCarrier.trim(),
        note: returnShipNote.trim(),
      });
      message.success(t("od.returnShipSubmitted"));
      setReturnShipOpen(false);
      setReturnTrackingNo("");
      setReturnCarrier("");
      setReturnShipNote("");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("od.applyFail"));
    }
  };

  const confirmReturnReceive = async () => {
    if (!order) return;
    try {
      await confirmReturnReceived(order.id);
      message.success(t("od.confirmReturnReceive"));
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "操作失败");
    }
  };

  const doExchange = async () => {
    if (!order) return;
    try {
      await requestExchange(order.id);
      message.success(t("od.exchangeSuccess"));
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "操作失败");
    }
  };

  const submitDispute = async () => {
    if (!order || !disputeReason.trim()) return;
    try {
      await openDispute(order.id, disputeReason.trim());
      message.success(t("od.disputeSubmitted"));
      setDisputeOpen(false);
      setDisputeReason("");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("od.applyFail"));
    }
  };

  const reviewDisputeAdmin = async (approve: boolean) => {
    if (!order) return;
    try {
      await reviewDispute(order.id, approve);
      message.success(approve ? t("od.refundApproved") : t("od.disputeMaintain"));
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
      message.error(err.response?.data?.detail || t("od.getLogFail"));
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
      message.success(t("od.logUpdated"));
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("od.addLogFail"));
    }
  };

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (!order) return <div className="text-center py-20">订单不存在</div>;

  const actions = user ? nextActions(order.status, user.role) : [];

  return (
    <div>
      <Button type="link" onClick={() => navigate(-1)}>
        {t("common.back")}
      </Button>
      <Card title={`订单 ${order.order_no}`} className="mt-2">
        <Descriptions column={2}>
          <Descriptions.Item label="状态">
            <Tag color={orderStatusMeta[order.status].color}>
              {orderStatusMeta[order.status].label}
            </Tag>
          </Descriptions.Item>
          {escrow && escrow.escrow_status !== "none" && (
            <Descriptions.Item label="担保/资金">
              <Tag color={escrowMeta[escrow.escrow_status].color}>
                {escrowMeta[escrow.escrow_status].label}
              </Tag>
            </Descriptions.Item>
          )}
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
                        {t("order.action.review")}
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
                {t(actionLabel[a])}
              </Button>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          {user?.role === "buyer" && ["paid", "shipped", "completed"].includes(order.status) && (
            <Button danger onClick={() => setRefundOpen(true)}>
              {t("od.applyRefund")}
            </Button>
          )}
          {user?.role === "buyer" && order.status === "return_requested" && (
            <Button onClick={() => setReturnShipOpen(true)}>{t("order.action.return_ship")}</Button>
          )}
          {user?.role === "buyer" && ["return_shipped", "return_received"].includes(order.status) && (
            <Tag color="gold">{t("od.awaitMerchant")}</Tag>
          )}
          {user?.role === "buyer" &&
            ["shipped", "completed", "refund_requested", "return_requested", "return_shipped", "return_received"].includes(
              order.status
            ) && <Button onClick={openLogistics}>{t("od.viewLogistics")}</Button>}
          {user?.role === "buyer" && ["return_requested", "return_shipped", "return_received"].includes(order.status) && (
            <Button danger onClick={() => setDisputeOpen(true)}>
              {t("order.action.dispute")}
            </Button>
          )}
          {user?.role === "merchant" && order.status === "refund_requested" && (
            <>
              <Button type="primary" onClick={() => doRefundReview(true)}>
                {t("od.approveRefund")}
              </Button>
              <Button danger onClick={() => doRefundReview(false)}>
                {t("od.rejectRefund")}
              </Button>
            </>
          )}
          {user?.role === "merchant" && order.status === "return_shipped" && (
            <Button type="primary" onClick={confirmReturnReceive}>
              {t("order.action.return_receive")}
            </Button>
          )}
          {user?.role === "merchant" && order.status === "return_received" && (
            <>
              <Button type="primary" onClick={() => doRefundReview(true)}>
                {t("od.approveRefund")}
              </Button>
              <Button onClick={doExchange}>{t("order.action.exchange")}</Button>
              <Button danger onClick={() => doRefundReview(false)}>
                {t("od.rejectReturn")}
              </Button>
            </>
          )}
          {user?.role === "admin" && order.status === "dispute" && (
            <>
              <Button type="primary" onClick={() => reviewDisputeAdmin(true)}>
                {t("od.refundApproved")}
              </Button>
              <Button onClick={() => reviewDisputeAdmin(false)}>{t("od.disputeMaintain")}</Button>
            </>
          )}
          {user?.role === "merchant" &&
            !["pending_payment", "completed"].includes(order.status) && (
              <Button onClick={() => setLogOpen(true)}>{t("od.addLogistics")}</Button>
            )}
        </div>
      </Card>

      <Modal
        title={`${t("order.action.review")}：${reviewFor?.name ?? ""}`}
        open={!!reviewFor}
        onCancel={() => setReviewFor(null)}
        onOk={submitReview}
        okText={t("common.submit")}
      >
        <Rate value={rating} onChange={setRating} />
        <Input.TextArea
          rows={4}
          className="mt-3"
          placeholder={t("od.reviewPlaceholder")}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
        />
      </Modal>

      <Modal
        title={t("od.applyRefund")}
        open={refundOpen}
        onCancel={() => setRefundOpen(false)}
        onOk={submitRefund}
        okText={t("common.submit")}
      >
        <Input.TextArea
          rows={4}
          placeholder={t("od.refundReasonPlaceholder")}
          value={refundReason}
          onChange={(e) => setRefundReason(e.target.value)}
        />
      </Modal>

      <Modal
        title={t("od.returnShipTitle")}
        open={returnShipOpen}
        onCancel={() => setReturnShipOpen(false)}
        onOk={submitReturnShip}
        okText={t("common.submit")}
      >
        <div className="mb-2 text-slate-500">{t("od.returnShipHint")}</div>
        <Input
          placeholder={t("od.carrier")}
          className="mb-2"
          value={returnCarrier}
          onChange={(e) => setReturnCarrier(e.target.value)}
        />
        <Input
          placeholder={t("od.trackingNo")}
          className="mb-2"
          value={returnTrackingNo}
          onChange={(e) => setReturnTrackingNo(e.target.value)}
        />
        <Input.TextArea
          rows={3}
          placeholder={t("od.returnShipNote")}
          value={returnShipNote}
          onChange={(e) => setReturnShipNote(e.target.value)}
        />
      </Modal>

      <Modal
        title={t("od.disputeTitle")}
        open={disputeOpen}
        onCancel={() => setDisputeOpen(false)}
        onOk={submitDispute}
        okText={t("common.submit")}
      >
        <Input.TextArea
          rows={4}
          maxLength={500}
          placeholder={t("od.disputeReasonPlaceholder")}
          value={disputeReason}
          onChange={(e) => setDisputeReason(e.target.value)}
        />
      </Modal>

      <Modal title={t("od.logistics")} open={logOpen} onCancel={() => setLogOpen(false)} footer={null}>
        {user?.role === "merchant" && (
          <div className="mb-3 flex gap-2">
            <Input
              placeholder={t("od.trackingNo")}
              value={logTrack}
              onChange={(e) => setLogTrack(e.target.value)}
            />
            <Input
              placeholder={t("od.logDescPlaceholder")}
              value={logDesc}
              onChange={(e) => setLogDesc(e.target.value)}
            />
            <Button type="primary" onClick={submitLogistics}>
              {t("od.addNode")}
            </Button>
          </div>
        )}
        {logData.tracking_no && (
          <div className="mb-2 text-slate-500">{t("od.trackingNo")}：{logData.tracking_no}</div>
        )}
        {logData.events.length === 0 ? (
          <div className="text-slate-400">{t("od.noLogistics")}</div>
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
