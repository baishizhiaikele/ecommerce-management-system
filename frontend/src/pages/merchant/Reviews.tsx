import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import {
  Table,
  Button,
  Tag,
  message,
  Modal,
  Form,
  Input,
  Select,
  Card,
  Rate,
  Popconfirm,
} from "antd";
import {
  merchantReviews,
  replyReview,
  pinReview,
  deleteReview,
  MerchantReviewItem,
} from "../../api";
import { useI18n, translate } from "../../i18n";

const sentimentMeta: Record<string, { labelKey: string; color: string }> = {
  positive: { labelKey: "mr.positive", color: "green" },
  neutral: { labelKey: "mr.neutral", color: "blue" },
  negative: { labelKey: "mr.negative", color: "red" },
};

export default function MerchantReviews() {
  const { t } = useI18n();
  const [items, setItems] = useState<MerchantReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sentiment, setSentiment] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [replyTo, setReplyTo] = useState<MerchantReviewItem | null>(null);
  const [form] = Form.useForm();

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const r = await merchantReviews({ page: p, page_size: 10, sentiment });
      setItems(r.items);
      setTotal(r.total);
      setPage(p);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentiment]);

  const submitReply = async () => {
    const v = await form.validateFields();
    if (!replyTo) return;
    try {
      await replyReview(replyTo.id, v.content);
      message.success(t("mr.replied"));
      setReplyTo(null);
      load(page);
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("common.replyFail"));
    }
  };

  const togglePin = async (r: MerchantReviewItem) => {
    try {
      await pinReview(r.id, !r.is_pinned);
      message.success(r.is_pinned ? t("mr.unpinned") : t("mr.pinned"));
      load(page);
    } catch {
      message.error(t("common.operationFailed"));
    }
  };
  const remove = async (id: string) => {
    try {
      await deleteReview(id);
      message.success(t("common.deleted"));
      load(page);
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("common.deleteFail"));
    }
  };

  return (
    <Card
      title={t("mr.title")}
      extra={
        <Select
          value={sentiment}
          style={{ width: 140 }}
          allowClear
          placeholder={t("mr.allSentiment")}
          onChange={(v) => setSentiment(v)}
          options={[
            { value: "negative", label: t("mr.filterOnlyNegative") },
            { value: "neutral", label: t("mr.filterNeutral") },
            { value: "positive", label: t("mr.filterPositive") },
          ]}
        />
      }
    >
      <Table
        rowKey="id"
        dataSource={items}
        loading={loading}
        pagination={{ current: page, total, pageSize: 10, onChange: load }}
        columns={[
          {
            title: t("mr.rating"),
            dataIndex: "rating",
            width: 120,
            render: (v) => <Rate disabled value={v} />,
          },
          {
            title: t("mr.sentiment"),
            dataIndex: "sentiment",
            render: (s) => <Tag color={sentimentMeta[s]?.color}>{translate(sentimentMeta[s]?.labelKey) || s}</Tag>,
          },
          { title: t("mr.content"), dataIndex: "content", ellipsis: true },
          {
            title: t("mr.replyCol"),
            dataIndex: "reply",
            render: (v) => (v ? <span className="text-emerald-600">{v}</span> : <span className="text-slate-300">—</span>),
          },
          {
            title: t("common.action"),
            render: (_, r) => (
              <span className="flex gap-1">
                <Button
                  type="link"
                  onClick={() => {
                    setReplyTo(r);
                    form.setFieldsValue({ content: r.reply || "" });
                  }}
                >
                  {r.reply ? t("mr.modifyReply") : t("mr.reply")}
                </Button>
                <Button type="link" onClick={() => togglePin(r)}>
                  {r.is_pinned ? t("mr.unpin") : t("mr.pin")}
                </Button>
                <Popconfirm title={t("mr.confirmDelete")} onConfirm={() => remove(r.id)}>
                  <Button type="link" danger>
                    {t("common.delete")}
                  </Button>
                </Popconfirm>
              </span>
            ),
          },
        ]}
      />

      <Modal
        title={t("mr.replyModal")}
        open={!!replyTo}
        onOk={submitReply}
        onCancel={() => setReplyTo(null)}
        okText={t("common.submit")}
        destroyOnClose
      >
        <p className="text-slate-500 mb-2">{t("mr.original")}{replyTo?.content}</p>
        <Form form={form} layout="vertical">
          <Form.Item name="content" label={t("mr.replyContent")} rules={[{ required: true, message: t("mr.reqReply") }]}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
