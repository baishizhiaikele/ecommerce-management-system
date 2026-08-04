import { Button, Card, Tag, Tooltip, message } from "antd";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { HeartFilled, HeartOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { useI18n } from "../i18n";
import { ProductOut, addFavorite, removeFavorite } from "../api";
import { getErrorMessage } from "../api/client";
import ProductImage from "./ProductImage";
import ProductPrice from "./ProductPrice";
import { getFlashPrice } from "../context/FlashPriceContext";
import { useCart } from "../store/cart";
import { useAuth } from "../store/auth";

/**
 * L4：从 Market.tsx 抽取的商品卡片，统一了"图片/价格/库存标/加购"渲染，
 * 供首页推荐、最近浏览、搜索结果等多处复用，避免复制粘贴。加购逻辑自带登录/错误提示。
 */
export default function ProductCard({ p, favorited = false }: { p: ProductOut; favorited?: boolean }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { add } = useCart();
  const user = useAuth((s) => s.user);
  // 收藏初始态由父级传入，避免卡片重新挂载后红心丢失
  const [faved, setFaved] = useState(favorited);
  const [adding, setAdding] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  const soldOut = p.stock <= 0;
  const detailUrl = `/products/${p.id}`;
  const go = () => navigate(detailUrl);

  const onAdd = async () => {
    if (adding) return;
    setAdding(true);
    try {
      // P0-F4：add() 内部对登录用户已调 addCartItem，不要在外层重复调用
      await add({
        product_id: p.id,
        name: p.name,
        price: getFlashPrice(p),
        quantity: 1,
        image_url: p.image_url ?? undefined,
      });
      message.success(t("pd.addedCart"));
    } catch (e) {
      message.error(getErrorMessage(e, t("pd.addCartFail")));
    } finally {
      setAdding(false);
    }
  };

  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      message.warning(t("pd.loginFirst") || t("auth.requiredLogin"));
      return;
    }
    if (favBusy) return;
    const next = !faved;
    setFaved(next);
    setFavBusy(true);
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
      message.error(getErrorMessage(err, t("common.operationFailed")));
    } finally {
      setFavBusy(false);
    }
  };

  return (
    <Card
      hoverable
      className="product-card group"
      cover={
        <div className="relative overflow-hidden">
          <ProductImage name={p.name} image_url={p.image_url} height={200} rounded={0} />
          {soldOut && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60">
              <span className="rounded-full bg-slate-700/85 px-3 py-1 text-xs font-medium text-white">
                {t("market.outStock")}
              </span>
            </div>
          )}
          <Tooltip title={faved ? t("pd.favRemove") : t("pd.fav")}>
            <Button
              shape="circle"
              type="text"
              aria-label={faved ? t("pd.favRemove") : t("pd.fav")}
              aria-pressed={faved}
              loading={favBusy}
              className="absolute top-2 right-2 bg-white/80 hover:bg-white shadow-sm"
              icon={
                faved ? (
                  <HeartFilled style={{ color: "#EF4444" }} />
                ) : (
                  <HeartOutlined style={{ color: "#EF4444" }} />
                )
              }
              onClick={toggleFav}
            />
          </Tooltip>
        </div>
      }
      onClick={go}
    >
      {/* 整卡可点击的同时保留一个真实链接，保证键盘 Tab 可达与右键“在新标签打开” */}
      <a
        href={detailUrl}
        className="block truncate text-sm font-medium text-slate-700 hover:text-[#4F46E5]"
        title={p.name}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          go();
        }}
      >
        {p.name}
      </a>
      <div className="flex items-center justify-between mt-2">
        <ProductPrice p={p} className="pc-price text-[#4F46E5]" />
        <Tag color={soldOut ? "red" : "green"}>
          {soldOut ? t("market.outStock") : t("market.inStock")}
        </Tag>
      </div>
      <Button
        block
        className="mt-3"
        type="primary"
        icon={<ShoppingCartOutlined />}
        disabled={soldOut}
        loading={adding}
        aria-label={t("pd.addCartOf", { name: p.name })}
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
      >
        {soldOut ? t("market.outStock") : t("pd.addCart")}
      </Button>
    </Card>
  );
}
