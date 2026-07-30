import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { Avatar, Button, Divider, Image, Input, Rate, Tag, message } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { listProductReviews, createProductReview, appendReview, type ReviewOut } from "../api";
import { useI18n } from "../i18n";
import { useAuth } from "../store/auth";
import { sentimentMeta } from "../utils/format";

function parseUrls(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function ProductReviews({ productId }: { productId: string }) {
  const { t } = useI18n();
  const user = useAuth((s) => s.user);
  const [items, setItems] = useState<ReviewOut[]>([]);
  const [content, setContent] = useState("");
  const [rating, setRating] = useState(5);
  const [images, setImages] = useState("");
  const [video, setVideo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [appendFor, setAppendFor] = useState<string | null>(null);
  const [appendText, setAppendText] = useState("");
  const [appendImages, setAppendImages] = useState("");
  const [appendSubmitting, setAppendSubmitting] = useState(false);

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
      await createProductReview(productId, {
        rating,
        content,
        images: parseUrls(images),
        video: video.trim() || null,
      });
      message.success(t("review.success"));
      setContent("");
      setImages("");
      setVideo("");
      setRating(5);
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("common.submitFail"));
    } finally {
      setSubmitting(false);
    }
  };

  const submitAppend = async (reviewId: string) => {
    if (!appendText.trim()) {
      message.warning(t("review.reqContent"));
      return;
    }
    setAppendSubmitting(true);
    try {
      await appendReview(reviewId, {
        content: appendText.trim(),
        images: parseUrls(appendImages),
      });
      message.success(t("review.appendSuccess"));
      setAppendFor(null);
      setAppendText("");
      setAppendImages("");
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("common.submitFail"));
    } finally {
      setAppendSubmitting(false);
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
              {r.images && r.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {r.images.map((src, i) => (
                    <Image
                      key={i}
                      src={src}
                      width={72}
                      height={72}
                      className="rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}
              {r.video && (
                <a
                  href={r.video}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#4F46E5] text-sm mt-1 inline-block"
                >
                  {t("review.video")} ↗
                </a>
              )}
              {r.append_content && (
                <div className="text-amber-600 text-sm mt-1">
                  {t("review.append")}：{r.append_content}
                </div>
              )}
              {r.reply && (
                <div className="text-emerald-600 text-sm mt-1">
                  {t("review.merchantReply")}
                  {r.reply}
                </div>
              )}
              {user && r.user_id === user.id && !r.append_content && (
                <div className="mt-1">
                  {appendFor === r.id ? (
                    <div className="space-y-2">
                      <Input.TextArea
                        rows={2}
                        value={appendText}
                        onChange={(e) => setAppendText(e.target.value)}
                        placeholder={t("review.appendPlaceholder")}
                      />
                      <Input
                        placeholder={t("review.imageUrls")}
                        value={appendImages}
                        onChange={(e) => setAppendImages(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="small"
                          type="primary"
                          loading={appendSubmitting}
                          onClick={() => submitAppend(r.id)}
                        >
                          {t("review.append")}
                        </Button>
                        <Button size="small" onClick={() => setAppendFor(null)}>
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="small" type="link" onClick={() => setAppendFor(r.id)}>
                      {t("review.append")}
                    </Button>
                  )}
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
        <Input
          placeholder={t("review.imageUrls")}
          value={images}
          onChange={(e) => setImages(e.target.value)}
        />
        <Input
          placeholder={t("review.videoUrl")}
          value={video}
          onChange={(e) => setVideo(e.target.value)}
        />
        <Button type="primary" loading={submitting} onClick={submit}>
          {t("review.submit")}
        </Button>
      </div>
    </div>
  );
}
