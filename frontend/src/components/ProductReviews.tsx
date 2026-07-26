import { useState } from "react";
import { List, Rate, Tag, Empty, Divider, Input, Button, message, Space } from "antd";
import { createProductReview, type ReviewOut } from "../api";
import { sentimentMeta } from "../utils/format";
import { useAuth } from "../store/auth";

interface Props {
  productId: string;
  reviews: ReviewOut[];
  onChanged?: () => void;
}

export default function ProductReviews({ productId, reviews, onChanged }: Props) {
  const user = useAuth((s) => s.user);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!content.trim()) {
      message.warning("请输入评价内容");
      return;
    }
    setSubmitting(true);
    try {
      await createProductReview(productId, { rating, content: content.trim() });
      message.success("评价成功，感谢分享");
      setContent("");
      setRating(5);
      onChanged?.();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {reviews.length === 0 ? (
        <Empty description="暂无评价" />
      ) : (
        <List
          itemLayout="vertical"
          dataSource={reviews}
          renderItem={(r) => (
            <List.Item>
              <div className="flex items-center gap-2 mb-1">
                <Rate disabled value={r.rating} style={{ fontSize: 14 }} />
                <Tag color={sentimentMeta[r.sentiment].color}>{sentimentMeta[r.sentiment].label}</Tag>
                {r.is_pinned ? <Tag color="gold">置顶</Tag> : null}
                <span className="text-xs text-slate-400 ml-auto">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="text-slate-700 whitespace-pre-wrap">{r.content}</div>
              {r.reply && (
                <div className="mt-2 pl-3 border-l-2 border-[#4F46E5]/30 bg-slate-50 rounded p-2 text-sm text-slate-600">
                  <span className="text-[#4F46E5] font-medium">商家回复：</span>
                  {r.reply}
                </div>
              )}
            </List.Item>
          )}
        />
      )}

      {user && user.role === "buyer" && (
        <>
          <Divider>我来评价</Divider>
          <Space direction="vertical" className="w-full">
            <Space>
              <span className="text-slate-500">评分</span>
              <Rate value={rating} onChange={setRating} />
            </Space>
            <Input.TextArea
              rows={3}
              placeholder="说说这件商品的使用体验…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={500}
              showCount
            />
            <Button type="primary" loading={submitting} onClick={submit}>
              提交评价
            </Button>
          </Space>
        </>
      )}
    </div>
  );
}
