import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button, Card, Empty, Popconfirm, Spin, Tag } from "antd";
import { ArrowLeft, Heart, PenLine, Trash2 } from "lucide-react";
import { useI18n } from "../i18n";
import { useAuth } from "../store/auth";
import { getNote, deleteNote, toggleNoteLike, NoteOut, NoteProductCard } from "../api";
import ProductImage from "../components/ProductImage";
import ProductPrice from "../components/ProductPrice";
import { formatDateTime } from "../utils/format";

export default function NoteDetail() {
  const { id = "" } = useParams();
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState<NoteOut | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!id) return;
    setLoading(true);
    getNote(id)
      .then(setNote)
      .catch(() => setNote(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onLike = async () => {
    if (!note) return;
    const r = await toggleNoteLike(note.id);
    setNote({ ...note, liked: r.liked, likes_count: r.likes_count });
  };

  const onDelete = async () => {
    if (!note) return;
    try {
      await deleteNote(note.id);
      navigate("/discover");
    } catch {
      // 忽略
    }
  };

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Spin />
      </div>
    );
  }

  if (!note) {
    return <Empty description={t("note.notFound")} className="py-24" />;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-4">
        <Button type="text" icon={<ArrowLeft size={18} />} onClick={() => navigate(-1)}>
          {t("common.back")}
        </Button>
        <h1 className="text-xl font-bold">{t("note.detailTitle")}</h1>
        {(user?.id === note.author_id || user?.role === "admin") && (
          <Popconfirm
            title={t("note.deleteConfirm")}
            okText={t("common.confirm")}
            cancelText={t("common.cancel")}
            onConfirm={onDelete}
          >
            <Button type="text" danger icon={<Trash2 size={16} />} className="ml-auto">
              {t("note.delete")}
            </Button>
          </Popconfirm>
        )}
      </div>

      <Card className="soft-card">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-medium">
            {(note.author_name || "?").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div className="text-sm font-medium">{note.author_name}</div>
            <div className="text-xs text-slate-400">
              {note.created_at ? formatDateTime(note.created_at) : ""}
            </div>
          </div>
        </div>

        <h2 className="text-lg font-bold mb-2">{note.title}</h2>
        <p className="text-slate-700 whitespace-pre-wrap leading-relaxed mb-4">{note.content}</p>

        {note.images.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            {note.images.map((img, i) => (
              <div key={i} className="rounded-xl overflow-hidden bg-slate-100">
                <ProductImage
                  src={img}
                  name={note.title}
                  alt={note.title}
                  height={200}
                  rounded={14}
                  className="w-full h-48 object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {note.products.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-medium text-slate-500 mb-2">{t("note.relatedProducts")}</div>
            <div className="space-y-2">
              {note.products.map((p: NoteProductCard) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-200 cursor-pointer"
                  onClick={() => navigate(`/products/${p.id}`)}
                >
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                    <ProductImage
                      src={p.image_url}
                      name={p.name}
                      alt={p.name}
                      height={56}
                      rounded={12}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm line-clamp-1">{p.name}</div>
                    <ProductPrice p={p} className="text-[#F97316] font-bold text-sm" />
                  </div>
                  <Tag color="orange" className="ml-auto">
                    {t("note.buyNow")}
                  </Tag>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mt-5 pt-4 border-t border-slate-100">
          <button
            className={`flex items-center gap-1 text-sm ${note.liked ? "text-rose-500" : "text-slate-400"}`}
            onClick={onLike}
          >
            <Heart size={18} fill={note.liked ? "currentColor" : "none"} />
            {note.likes_count}
          </button>
          <Tag className="ml-auto" color="blue">
            <PenLine size={13} className="inline mr-1" />
            {t("note.detailTitle")}
          </Tag>
        </div>
      </Card>
    </div>
  );
}
