import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import { Card, Button, Spin, Tag, Popconfirm, message } from "antd";
import { HeartFilled, ShoppingCartOutlined } from "@ant-design/icons";
import EmptyState from "../components/EmptyState";
import { listFavorites, removeFavorite, addCartItem, ProductOut } from "../api";
import { useCart } from "../store/cart";
import { money } from "../utils/format";
import { useI18n } from "../i18n";

export default function Favorites() {
  const navigate = useNavigate();
  const add = useCart((s) => s.add);
  const { t } = useI18n();
  const [items, setItems] = useState<ProductOut[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listFavorites());
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const onRemove = async (id: string) => {
    try {
      await removeFavorite(id);
      setItems((s) => s.filter((p) => p.id !== id));
      message.success(t("favorites.removed"));
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const onAdd = async (p: ProductOut) => {
    try {
      await addCartItem({ product_id: p.id, quantity: 1 });
      add({
        product_id: p.id,
        name: p.name,
        price: Number(p.price),
        quantity: 1,
        image_url: p.image_url || undefined,
      });
      message.success(t("pd.addedCart"));
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };

  return (
    <div>
      <div className="section-title">
        <HeartFilled style={{ color: "#EF4444" }} />
        <h2>{t("page.favorites.title")}</h2>
        <span className="sh-action">{t("fav.total").replace("{n}", String(items.length))}</span>
      </div>
      {loading ? (
        <div className="flex justify-center py-20">
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t("empty.favorites")}
          description={t("empty.favoritesDesc")}
          action={<Button type="primary" onClick={() => navigate("/")}>{t("favorites.browse")}</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {items.map((p) => (
            <Card
              key={p.id}
              hoverable
              className="rounded-2xl overflow-hidden product-card group"
              cover={
                <img
                  alt={p.name}
                  src={p.image_url || ""}
                  className="h-40 w-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105"
                  onClick={() => navigate(`/products/${p.id}`)}
                />
              }
              actions={[
                <ShoppingCartOutlined key="add" onClick={() => onAdd(p)} />,
                <Popconfirm
                  key="del"
                  title={t("favorites.confirmRemove")}
                  onConfirm={() => onRemove(p.id)}
                  okText={t("common.confirm")}
                  cancelText={t("common.cancel")}
                >
                  <HeartFilled style={{ color: "#EF4444" }} />
                </Popconfirm>,
              ]}
            >
              <Card.Meta
                title={
                  <div className="truncate" title={p.name}>
                    {p.name}
                  </div>
                }
                description={
                  <div className="flex items-center justify-between">
                    <span className="text-[#4F46E5] font-semibold">{money(p.price)}</span>
                    <Tag color={p.stock > 0 ? "green" : "red"}>
                      {p.stock > 0 ? t("market.inStock") : t("market.outStock")}
                    </Tag>
                  </div>
                }
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
