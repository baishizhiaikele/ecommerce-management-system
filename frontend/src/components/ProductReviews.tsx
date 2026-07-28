import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { Avatar, Input, Button, Rate, message, Divider, Tag } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { listProductReviews, createProductReview, ReviewOut } from "../api";
import { useI18n } from "../i18n";
import { sentimentMeta } from "../utils/format";

export default function ProductReviews({ productId }: { productId: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ReviewOut[]>([]);
  const [content, setContent] = useState("");
  const [rating, setRating] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const load = async () => {
    setItems(await listProductReviews(productId));
  };
  useEffect(() => {
    load();
  }, [productId]);

  const submit = async () => {
    if (!content.trim()) {
      message.warning(t("review.reqContent"));
      return;
    }
    setSubmitting(true);
    try {
      await createProductReview(productId, { rating, content });
      message.success(t("review.success"));
      setContent("");
      setRating(5);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("common.submitFail"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="text-slate-400 text-sm">{t("review.empty")}</div>
      ) : (
        items.map((r) => (
          <div key={r.id} className="flex gap-3">
            <Avatar icon={<UserOutlined />} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.username || "-"}</span>
                <Rate disabled value={r.rating} />
                <Tag color={sentimentMeta[r.sentiment].color}>{sentimentMeta[r.sentiment].label}</Tag>
                {r.is_pinned && <Tag color="gold">{t("mr.pin")}</Tag>}
              </div>
              <div className="text-slate-600 mt-1">{r.content}</div>
              {r.reply && (
                <div className="text-emerald-600 text-sm mt-1">
                  {t("review.merchantReply")}
                  {r.reply}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      <Divider>{t("review.divider")}</Divider>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{t("mr.rating")}</span>
          <Rate value={rating} onChange={setRating} />
        </div>
        <Input.TextArea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t("review.placeholder")}
        />
        <Button type="primary" loading={submitting} onClick={submit}>
          {t("review.submit")}
        </Button>
      </div>
    </div>
  );
}
