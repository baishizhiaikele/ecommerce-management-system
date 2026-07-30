import { Button, Card, Tag, message } from "antd";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import type { AxiosError } from "axios";
import { HeartFilled, HeartOutlined } from "@ant-design/icons";
import { useI18n } from "../i18n";
import { ApiError, ProductOut, addCartItem, addFavorite, removeFavorite } from "../api";
import ProductImage from "./ProductImage";
import ProductPrice from "./ProductPrice";
import { getFlashPrice } from "../context/FlashPriceContext";
import { useCart } from "../store/cart";
import { useAuth } from "../store/auth";

/**
 * L4：从 Market.tsx 抽取的商品卡片，统一了"图片/价格/库存标/加购"渲染，
 * 供首页推荐、最近浏览、搜索结果等多处复用，避免复制粘贴。加购逻辑自带登录/错误提示。
 */
export default function ProductCard({ p }: { p: ProductOut }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { add } = useCart();
  const user = useAuth((s) => s.user);
  const [faved, setFaved] = useState(false);

  const onAdd = async () => {
    try {
      await addCartItem({ product_id: p.id, quantity: 1 });
      add({ product_id: p.id, name: p.name, price: getFlashPrice(p), quantity: 1, image_url: undefined });
      message.success(t("pd.addedCart"));
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("pd.addCartFail"));
    }
  };

  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      message.warning(t("pd.loginFirst") || t("auth.requiredLogin"));
      return;
    }
    const next = !faved;
    setFaved(next);
    try {
      if (next) {
        await addFavorite(p.id);
        message.success(t("pd.favAdded"));
      } else {
        await removeFavorite(p.id);
        message.success(t("pd.favRemoved"));
      }
    } catch (err) {
      setFaved(!next);
      const e2 = err as AxiosError<ApiError>;
      message.error(e2.response?.data?.detail || t("common.operationFailed"));
    }
  };

  return (
    <Card
      hoverable
      className="product-card group"
      cover={
        <div className="relative">
          <ProductImage name={p.name} image_url={p.image_url} height={200} rounded={0} />
          <Button
            shape="circle"
            type="text"
            aria-label={t("pd.fav")}
            className="absolute top-2 right-2 bg-white/80 hover:bg-white shadow-sm"
            icon={faved ? <HeartFilled style={{ color: "#EF4444" }} /> : <HeartOutlined style={{ color: "#EF4444" }} />}
            onClick={toggleFav}
          />
        </div>
      }
      onClick={() => navigate(`/products/${p.id}`)}
    >
      <div className="truncate text-sm text-slate-700 font-medium" title={p.name}>
        {p.name}
      </div>
      <div className="flex items-center justify-between mt-2">
        <ProductPrice p={p} className="pc-price text-[#4F46E5]" />
        <Tag color={p.stock > 0 ? "green" : "red"}>
          {p.stock > 0 ? t("market.inStock") : t("market.outStock")}
        </Tag>
      </div>
      <Button
        block
        className="mt-3"
        type="primary"
        disabled={p.stock <= 0}
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
      >
        {t("pd.addCart")}
      </Button>
    </Card>
  );
}
