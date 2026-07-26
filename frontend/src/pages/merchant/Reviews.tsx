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

const sentimentMeta: Record<string, { label: string; color: string }> = {
  positive: { label: "好评", color: "green" },
  neutral: { label: "中性", color: "blue" },
  negative: { label: "差评", color: "red" },
};

export default function MerchantReviews() {
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
      message.success("已回复");
      setReplyTo(null);
      load(page);
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "回复失败");
    }
  };

  const togglePin = async (r: MerchantReviewItem) => {
    try {
      await pinReview(r.id, !r.is_pinned);
      message.success(r.is_pinned ? "已取消置顶" : "已置顶");
      load(page);
    } catch {
      message.error("操作失败");
    }
  };
  const remove = async (id: string) => {
    try {
      await deleteReview(id);
      message.success("已删除");
      load(page);
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "删除失败");
    }
  };

  return (
    <Card
      title="评价管理"
      extra={
        <Select
          value={sentiment}
          style={{ width: 140 }}
          allowClear
          placeholder="全部情感"
          onChange={(v) => setSentiment(v)}
          options={[
            { value: "negative", label: "仅差评" },
            { value: "neutral", label: "中性" },
            { value: "positive", label: "好评" },
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
            title: "评分",
            dataIndex: "rating",
            width: 120,
            render: (v) => <Rate disabled value={v} />,
          },
          {
            title: "情感",
            dataIndex: "sentiment",
            render: (s) => <Tag color={sentimentMeta[s]?.color}>{sentimentMeta[s]?.label || s}</Tag>,
          },
          { title: "内容", dataIndex: "content", ellipsis: true },
          {
            title: "商家回复",
            dataIndex: "reply",
            render: (v) => (v ? <span className="text-emerald-600">{v}</span> : <span className="text-slate-300">—</span>),
          },
          {
            title: "操作",
            render: (_, r) => (
              <span className="flex gap-1">
                <Button
                  type="link"
                  onClick={() => {
                    setReplyTo(r);
                    form.setFieldsValue({ content: r.reply || "" });
                  }}
                >
                  {r.reply ? "修改回复" : "回复"}
                </Button>
                <Button type="link" onClick={() => togglePin(r)}>
                  {r.is_pinned ? "取消置顶" : "置顶"}
                </Button>
                <Popconfirm title="确认删除该评价？" onConfirm={() => remove(r.id)}>
                  <Button type="link" danger>
                    删除
                  </Button>
                </Popconfirm>
              </span>
            ),
          },
        ]}
      />

      <Modal
        title="回复评价"
        open={!!replyTo}
        onOk={submitReply}
        onCancel={() => setReplyTo(null)}
        okText="提交"
        destroyOnClose
      >
        <p className="text-slate-500 mb-2">原评价：{replyTo?.content}</p>
        <Form form={form} layout="vertical">
          <Form.Item name="content" label="回复内容" rules={[{ required: true, message: "请输入回复" }]}>
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
