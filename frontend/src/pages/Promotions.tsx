import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Tag, Empty, Spin, Segmented, Row, Col } from "antd";
import { Flame, Zap, Gift } from "lucide-react";
import { getPromotions, type PromotionOut, type PromotionType } from "../api";
import { money } from "../utils/format";
import { useI18n, translate } from "../i18n";
import ProductImage from "../components/ProductImage";
import Reveal from "../components/Reveal";

const TYPE_META: Record<PromotionType, { label: string; color: string; icon: JSX.Element }> = {
  flash: { label: "promo.flash", color: "#f43f5e", icon: <Flame size={16} /> },
  discount: { label: "promo.discount", color: "#f59e0b", icon: <Zap size={16} /> },
  full_reduce: { label: "promo.fullReducePromo", color: "#10b981", icon: <Gift size={16} /> },
};

function finalPrice(p: PromotionOut): number | null {
  if (p.discount_price != null) return Number(p.discount_price);
  if (p.discount_rate != null && p.original_price != null)
    return Number(p.original_price) * Number(p.discount_rate);
  return null;
}

function Countdown({ endAt }: { endAt?: string | null }) {
  const [left, setLeft] = useState("");
  useEffect(() => {
    if (!endAt) return;
    const tick = () => {
      const diff = new Date(endAt).getTime() - Date.now();
      if (diff <= 0) return setLeft(translate("market.ended"));
      const d = Math.floor(diff / 8.64e7);
      const h = Math.floor((diff % 8.64e7) / 3.6e6);
      const m = Math.floor((diff % 3.6e6) / 6e4);
      const s = Math.floor((diff % 6e4) / 1000);
      setLeft(`${d > 0 ? d + translate("promo.dayUnit") + " " : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endAt]);
  if (!endAt) return null;
  return <span className="font-mono text-xs text-rose-600">{left}</span>;
}

export default function Promotions() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [list, setList] = useState<PromotionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PromotionType | "all">("all");

  useEffect(() => {
    setLoading(true);
    getPromotions()
      .then(setList)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const filtered = tab === "all" ? list : list.filter((p) => p.type === tab);
    const map: Record<string, PromotionOut[]> = {};
    for (const p of filtered) {
      if (!map[p.type]) map[p.type] = [];
      map[p.type].push(p);
    }
    return map;
  }, [list, tab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-extrabold text-slate-800">{t("page.promotions.title")}</h1>
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as PromotionType | "all")}
          options={[
            { label: t("common.all"), value: "all" },
            { label: t("promo.seckill"), value: "flash" },
            { label: t("promo.discount"), value: "discount" },
            { label: t("promo.fullReduce"), value: "full_reduce" },
          ]}
        />
      </div>

      {loading ? (
        <div className="text-center py-20">
          <Spin />
        </div>
      ) : Object.keys(groups).length === 0 ? (
        <Empty className="py-20" description={t("promo.empty")} />
      ) : (
        Object.entries(groups).map(([type, items]) => (
          <section key={type}>
            <div className="section-title flex items-center gap-2" style={{ color: TYPE_META[type as PromotionType].color }}>
              {TYPE_META[type as PromotionType].icon}
              <span className="st-text">{t(TYPE_META[type as PromotionType].label)}</span>
            </div>
            <Row gutter={[16, 16]}>
              {items.map((p, i) => {
                const fp = finalPrice(p);
                return (
                  <Col key={p.id} xs={24} sm={12} md={8} lg={6}>
                    <Reveal delay={(i % 4) * 60}>
                      <Card
                        hoverable
                        className="soft-card overflow-hidden"
                        onClick={() => p.product_id && navigate(`/products/${p.product_id}`)}
                      >
                        <div className="relative">
                          <div className="aspect-[4/3] bg-slate-100">
                            <ProductImage src={p.product_image} alt={p.product_name || p.title} />
                          </div>
                          <Tag
                            color={TYPE_META[p.type].color}
                            className="absolute top-2 left-2"
                          >
                            {t(TYPE_META[p.type].label)}
                          </Tag>
                        </div>
                        <div className="p-3">
                          <div className="font-semibold truncate">{p.title}</div>
                          <div className="text-xs text-slate-400 truncate mb-2">
                            {p.product_name}
                          </div>
                          <div className="flex items-end gap-2">
                            {fp != null ? (
                              <>
                                <span className="text-xl font-extrabold text-rose-600">
                                  ¥{money(fp)}
                                </span>
                                {p.original_price != null && (
                                  <span className="text-xs text-slate-400 line-through">
                                    ¥{money(Number(p.original_price))}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-sm text-slate-500">{t("promo.viewDetail")}</span>
                            )}
                          </div>
                          {p.end_at && (
                            <div className="mt-2">
                              <Countdown endAt={p.end_at} />
                            </div>
                          )}
                        </div>
                      </Card>
                    </Reveal>
                  </Col>
                );
              })}
            </Row>
          </section>
        ))
      )}
    </div>
  );
}
