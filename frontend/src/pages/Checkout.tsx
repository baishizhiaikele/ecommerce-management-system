import { useEffect, useState } from "react";
import { Empty, Spin, message } from "antd";
import { getCart, type CartItemOut } from "../api";
import { useI18n } from "../i18n";
import CheckoutPanel from "../components/CheckoutPanel";

/**
 * 独立确认订单页（/checkout）。
 * 从购物车页「去结算」跳转而来：复用 CheckoutPanel 展示完整的费用明细、优惠、地址与配送方式，
 * 形成「购物车 → 确认订单」两步主流程，对标天猫/京东结算前的确认页。
 */
export default function Checkout() {
  const { t } = useI18n();
  const [items, setItems] = useState<CartItemOut[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const cart = await getCart();
        setItems(cart);
        setSelectedIds(cart.map((it) => it.id));
      } catch (e) {
        message.error((e as any)?.response?.data?.detail || t("cart.loadFail"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-20">
        <Empty description={t("cart.empty")} />
      </div>
    );
  }

  return (
    <CheckoutPanel
      items={items}
      selectedIds={selectedIds}
      onReload={() => {
        getCart().then((cart) => {
          setItems(cart);
          setSelectedIds(cart.map((it) => it.id));
        });
      }}
      variant="page"
    />
  );
}
