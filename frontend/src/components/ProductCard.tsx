import { Button, Card, Tag, message } from "antd";
import { useNavigate } from "react-router-dom";
import type { AxiosError } from "axios";
import { useI18n } from "../i18n";
import { ApiError, ProductOut, addCartItem } from "../api";
import { money } from "../utils/format";
import ProductImage from "./ProductImage";
import { useCart } from "../store/cart";

/**
 * L4：从 Market.tsx 抽取的商品卡片，统一了"图片/价格/库存标/加购"渲染，
 * 供首页推荐、最近浏览、搜索结果等多处复用，避免复制粘贴。加购逻辑自带登录/错误提示。
 */
export default function ProductCard({ p }: { p: ProductOut }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { add } = useCart();

  const onAdd = async () => {
    try {
      await addCartItem({ product_id: p.id, quantity: 1 });
      add({ product_id: p.id, name: p.name, price: Number(p.price), quantity: 1, image_url: undefined });
      message.success(t("pd.addedCart"));
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("pd.addCartFail"));
    }
  };

  return (
    <Card
      hoverable
      className="product-card group"
      cover={<ProductImage name={p.name} image_url={p.image_url} height={200} rounded={0} />}
      onClick={() => navigate(`/products/${p.id}`)}
    >
      <div className="truncate text-sm text-slate-700 font-medium" title={p.name}>
        {p.name}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="pc-price text-[#4F46E5]">
          <span className="text-sm align-top mr-0.5">¥</span>
          {money(p.price)}
        </span>
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
