import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Col, Empty, Row, Spin, Typography } from "antd";
import {
  listHistory,
  listRecentlyBought,
  type BoughtOut,
  type ViewLogOut,
} from "../api";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";

function ProductCard({
  id,
  name,
  image,
  price,
}: {
  id: string;
  name?: string | null;
  image?: string | null;
  price?: number | null;
}) {
  const navigate = useNavigate();
  return (
    <div onClick={() => navigate(`/products/${id}`)} className="cursor-pointer group">
      <div className="aspect-square rounded-xl overflow-hidden bg-slate-100">
        {image ? (
          <img
            src={image}
            alt={name || ""}
            className="w-full h-full object-cover group-hover:scale-105 transition"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">
            No Image
          </div>
        )}
      </div>
      <div className="mt-1 text-sm text-slate-700 truncate">{name}</div>
      {price != null && <div className="text-xs text-rose-500">¥{price}</div>}
    </div>
  );
}

export default function History() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [history, setHistory] = useState<ViewLogOut[]>([]);
  const [bought, setBought] = useState<BoughtOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([listHistory(), listRecentlyBought()])
      .then(([h, b]) => {
        setHistory(h);
        setBought(b);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) {
    return <Empty description={t("common.loginFirst")} />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      <Spin spinning={loading}>
        <section>
          <Typography.Title level={4}>{t("history.recentlyViewed")}</Typography.Title>
          {history.length === 0 ? (
            <Empty description={t("history.emptyView")} />
          ) : (
            <Row gutter={[12, 12]}>
              {history.map((h) => (
                <Col key={h.id} xs={12} sm={8} md={6} lg={4}>
                  <ProductCard
                    id={h.product_id}
                    name={h.product_name}
                    image={h.image_url}
                    price={h.price}
                  />
                </Col>
              ))}
            </Row>
          )}
        </section>

        {bought.length > 0 && (
          <section>
            <Typography.Title level={4}>{t("history.recentlyBought")}</Typography.Title>
            <Row gutter={[12, 12]}>
              {bought.map((b) => (
                <Col key={b.product_id} xs={12} sm={8} md={6} lg={4}>
                  <ProductCard
                    id={b.product_id}
                    name={`${b.product_name} ×${b.times}`}
                    image={b.image_url}
                  />
                </Col>
              ))}
            </Row>
          </section>
        )}
      </Spin>
    </div>
  );
}
