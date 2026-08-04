import { useCallback, useEffect, useState } from "react";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import { getCart, type CartItemOut } from "../api";
import { getErrorMessage } from "../api/client";
import { useI18n } from "../i18n";
import CheckoutPanel from "../components/CheckoutPanel";
import AsyncBoundary from "../components/AsyncBoundary";

/**
 * 独立确认订单页（/checkout）。
 * 从购物车页「去结算」跳转而来：复用 CheckoutPanel 展示完整的费用明细、优惠、地址与配送方式，
 * 形成「购物车 → 确认订单」两步主流程，对标天猫/京东结算前的确认页。
 */
export default function Checkout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItemOut[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // 结算页拉取失败必须与"购物车为空"区分：前者要重试，后者要引导去逛
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cart = await getCart();
      setItems(cart);
      setSelectedIds(cart.map((it) => it.id));
    } catch (e) {
      setError(getErrorMessage(e, t("cart.loadFail")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AsyncBoundary
      loading={loading}
      error={error}
      retry={load}
      isEmpty={items.length === 0}
      emptyTitle={t("cart.empty")}
      emptyDescription={t("cart.emptyDesc")}
      emptyAction={
        <Button type="primary" onClick={() => navigate("/")}>
          {t("cart.goShop")}
        </Button>
      }
      errorAction={<Button onClick={() => navigate("/cart")}>{t("checkout.backToCart")}</Button>}
    >
      <CheckoutPanel
        items={items}
        selectedIds={selectedIds}
        onReload={() => void load()}
        variant="page"
      />
    </AsyncBoundary>
  );
}
