import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Empty,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Spin,
  Tag,
  Upload,
} from "antd";
import { BookOpen, Heart, PenLine, Trash2 } from "lucide-react";
import {
  attachAffiliate,
  createNote,
  deleteNote,
  getNoteFeed,
  listNotes,
  listProducts,
  NoteOut,
  ProductOut,
  toggleNoteLike,
  trackAffiliateClick,
  uploadImage,
} from "../api";
import ProductImage from "../components/ProductImage";
import ProductPrice from "../components/ProductPrice";
import { formatDateTime } from "../utils/format";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";
import { getErrorMessage } from "../api/client";
import { reportError } from "../utils/reportError";

export default function Discover() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [products, setProducts] = useState<ProductOut[]>([]);

  const load = useCallback(
    (kw?: string) => {
      setLoading(true);
      // 种草推荐流：已审核通过的笔记按「热度+新近」综合排序（商业化闭环入口）
      (kw ? listNotes({ keyword: kw }) : getNoteFeed({ limit: 30, offset: 0 }))
        .then(setNotes)
        .catch((e: any) => {
          // 游客未登录时静默处理，展示空态而非弹出后端错误文案
          if (e?.response?.status !== 401 && user) {
            message.error(getErrorMessage(e));
          }
        })
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    load();
    listProducts()
      .then(setProducts)
      .catch((e) => reportError(e, { tag: "Discover.products" }));
  }, []);

  const onLike = async (n: NoteOut) => {
    try {
      const r = await toggleNoteLike(n.id);
      setNotes((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, liked: r.liked, likes_count: r.likes_count } : x))
      );
    } catch {
      /* 忽略 */
    }
  };

  const onDelete = async (n: NoteOut) => {
    try {
      await deleteNote(n.id);
      setNotes((prev) => prev.filter((x) => x.id !== n.id));
      message.success(t("note.deleted"));
    } catch {
      message.error(t("note.deleteFail"));
    }
  };

  // 种草商业化闭环：作者将笔记与分销推广绑定，生成专属分享链接
  const onPromote = async (n: NoteOut) => {
    try {
      const updated = await attachAffiliate(n.id);
      setNotes((prev) => prev.map((x) => (x.id === n.id ? updated : x)));
      if (updated.share_url) {
        try {
          await navigator.clipboard?.writeText(updated.share_url);
          message.success(t("note.promoteOk"));
        } catch {
          message.success(t("note.promoteLinked"));
        }
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("note.promoteFail"));
    }
  };

  const onPublish = async () => {
    if (!title.trim() || !content.trim()) {
      message.warning(t("note.requireTitleContent"));
      return;
    }
    const url = imageUrl.trim();
    if (url && !/^(\/uploads\/|https?:\/\/)/i.test(url)) {
      message.warning(t("note.imageUrlInvalid"));
      return;
    }
    setSubmitting(true);
    try {
      const note = await createNote({
        title: title.trim(),
        content: content.trim(),
        images: imageUrl.trim() ? [imageUrl.trim()] : [],
        product_ids: productIds,
      });
      setNotes((prev) => [note, ...prev]);
      setOpen(false);
      setTitle("");
      setContent("");
      setImageUrl("");
      setProductIds([]);
      message.success(t("note.published"));
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("note.publishFail"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 flex-wrap">
        <BookOpen size={22} className="text-[#4F46E5]" />
        <h1 className="text-2xl font-bold">{t("note.title")}</h1>
        <Input.Search
          className="ml-auto"
          style={{ maxWidth: 260 }}
          placeholder={t("note.searchPlaceholder")}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onSearch={(v) => load(v.trim() || undefined)}
          allowClear
        />
        <Button type="primary" icon={<PenLine size={14} />} onClick={() => setOpen(true)}>
          {t("note.publish")}
        </Button>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Spin /></div>
      ) : notes.length === 0 ? (
        <Empty
          description={!user ? t("common.loginToViewNotes") : t("note.empty")}
          className="py-20"
        >
          {!user && (
            <Link to="/login">
              <Button type="primary">{t("common.signIn")}</Button>
            </Link>
          )}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {notes.map((n) => (
            <Card
              key={n.id}
              className="soft-card cursor-pointer hover:shadow-md transition-shadow"
              styles={{ body: { padding: 18 } }}
              onClick={() => navigate(`/discover/${n.id}`)}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-medium">
                  {n.author_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-sm font-medium">{n.author_name}</span>
                <span className="text-xs text-slate-400 ml-auto">
                  {n.created_at ? formatDateTime(n.created_at) : ""}
                </span>
              </div>
              <div className="font-bold text-base">{n.title}</div>
              <div className="text-sm text-slate-600 mt-1 whitespace-pre-wrap line-clamp-4">
                {n.content}
              </div>
              {n.images.length > 0 && (
                <div className="flex gap-2 mt-3 overflow-x-auto">
                  {n.images.map((img, i) => (
                    <div key={i} className="h-28 w-28 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                      <ProductImage
                        src={img}
                        name={n.title}
                        alt={n.title}
                        height={112}
                        rounded={12}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}
              {n.products.length > 0 && (
                <div className="mt-3 space-y-2">
                  {n.products.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-2 rounded-xl border border-slate-100 hover:border-indigo-200 cursor-pointer"
                      onClick={() => {
                        // 种草商业化闭环：从已推广笔记点进商品，埋点归因到作者推广码
                        if (n.affiliate_code) trackAffiliateClick(n.affiliate_code);
                        navigate(`/products/${p.id}`);
                      }}
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                        <ProductImage
                          src={p.image_url}
                          name={p.name}
                          alt={p.name}
                          height={48}
                          rounded={12}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm line-clamp-1">{p.name}</div>
                        <ProductPrice p={p as unknown as ProductOut} className="text-[#F97316] font-bold text-sm" />
                      </div>
                      <Tag color="orange">{t("note.buyNow")}</Tag>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-3 mt-3">
                <button
                  className={`flex items-center gap-1 text-sm ${n.liked ? "text-rose-500" : "text-slate-400"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLike(n);
                  }}
                >
                  <Heart size={16} fill={n.liked ? "currentColor" : "none"} />
                  {n.likes_count}
                </button>
                {n.affiliate_code && (
                  <Tag color="green" className="text-xs">{t("note.promoting")}</Tag>
                )}
                {user?.id === n.author_id && (
                  <Button
                    size="small"
                    type={n.affiliate_code ? "default" : "primary"}
                    className="ml-auto"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPromote(n);
                    }}
                  >
                    {n.affiliate_code ? t("note.copyShare") : t("note.promote")}
                  </Button>
                )}
                {(user?.id === n.author_id || user?.role === "admin") && (
                  <Popconfirm title={t("note.deleteConfirm")} onConfirm={() => onDelete(n)}>
                    <button
                      className="flex items-center gap-1 text-sm text-slate-400 hover:text-rose-500"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 size={15} />
                    </button>
                  </Popconfirm>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        title={t("note.publishTitle")}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={onPublish}
        confirmLoading={submitting}
        okText={t("note.publish")}
      >
        <div className="space-y-3 pt-2">
          <Input
            placeholder={t("note.titlePlaceholder")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
          <Input.TextArea
            rows={4}
            placeholder={t("note.contentPlaceholder")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={5000}
          />
          <div className="flex gap-2">
            <Input
              placeholder={t("note.imagePlaceholder")}
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              maxLength={500}
            />
            <Upload
              showUploadList={false}
              beforeUpload={async (file) => {
                const isImg = /(image\/jpeg|image\/png|image\/gif|image\/webp)/.test(file.type);
                if (!isImg) {
                  message.error(t("note.uploadImageType"));
                  return Upload.LIST_IGNORE;
                }
                try {
                  const res = await uploadImage(file as unknown as File);
                  setImageUrl(res.url);
                  message.success(t("note.uploadImageOk"));
                } catch {
                  message.error(t("note.uploadImageFail"));
                }
                return Upload.LIST_IGNORE;
              }}
            >
              <Button icon={<PenLine size={14} />}>{t("note.uploadImage")}</Button>
            </Upload>
          </div>
          <Select
            mode="multiple"
            className="w-full"
            placeholder={t("note.productsPlaceholder")}
            value={productIds}
            onChange={setProductIds}
            onSelect={() => {
              // 选中后立即收起下拉，避免"添加完下拉列表还在"
              setTimeout(() => (document.activeElement as HTMLElement | null)?.blur(), 0);
            }}
            optionFilterProp="label"
            options={products.map((p) => ({ value: p.id, label: p.name }))}
            maxTagCount={4}
          />
        </div>
      </Modal>
    </div>
  );
}
