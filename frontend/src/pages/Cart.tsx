import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Checkbox,
  Empty,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Spin,
  Tag,
  Tooltip,
} from "antd";
import {
  DeleteOutlined,
  ReloadOutlined,
  SafetyOutlined,
  ShoppingOutlined,
} from "@ant-design/icons";
import {
  getCart,
  removeCartItem,
  updateCartItem,
  getCartPreview,
  proxyImg,
  type CartItemOut,
  type CartPreview,
} from "../api";
import { money } from "../utils/format";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";
import CheckoutPanel from "../components/CheckoutPanel";

interface LocationState {
  buyNowProductId?: string;
}

export default function Cart() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const buyNowProductId = (location.state as LocationState)?.buyNowProductId;

  const [items, setItems] = useState<CartItemOut[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string>();
  const [qtyInput, setQtyInput] = useState<number>(1);
  const [clearOpen, setClearOpen] = useState(false);
  const [preview, setPreview] = useState<CartPreview | null>(null);

  // 组件首次挂载就刷新购物车角标
  useEffect(() => {
    void import("../store/cart").then((m) => m.useCart.getState().reloadServer());
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [cart, pv] = await Promise.all([
        getCart(),
        getCartPreview().catch(() => null),
      ]);
      setItems(cart);
      setPreview(pv);
      setSelectedIds((prev) => {
        const valid = cart.filter((it) => prev.includes(it.id)).map((it) => it.id);
        if (buyNowProductId) {
          const only = cart.filter((it) => it.product_id === buyNowProductId).map((it) => it.id);
          return only.length ? only : valid;
        }
        // 首次进入默认全选
        return prev.length ? valid : cart.map((it) => it.id);
      });
    } catch (e) {
      message.error((e as any)?.response?.data?.detail || t("cart.loadFail"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = (id: string, checked: boolean) =>
    setSelectedIds((s) => (checked ? [...s, id] : s.filter((x) => x !== id)));
  const allChecked = items.length > 0 && selectedIds.length === items.length;
  const toggleAll = (checked: boolean) =>
    setSelectedIds(checked ? items.map((it) => it.id) : []);

  const removeItem = async (id: string) => {
    try {
      await removeCartItem(id);
      setItems((s) => s.filter((it) => it.id !== id));
      setSelectedIds((s) => s.filter((x) => x !== id));
      void import("../store/cart").then((m) => m.useCart.getState().reloadServer());
    } catch {
      message.error(t("cart.removeFail"));
    }
  };

  const saveQty = async (it: CartItemOut) => {
    const q = Math.max(1, Math.min(99, Math.floor(qtyInput || 1)));
    setEditingId(undefined);
    try {
      await updateCartItem(it.id, q);
      setItems((s) => s.map((x) => (x.id === it.id ? { ...x, quantity: q } : x)));
      void import("../store/cart").then((m) => m.useCart.getState().reloadServer());
    } catch {
      message.error(t("cart.updateFail"));
    }
  };

  const clearCart = async () => {
    try {
      await Promise.all(items.map((it) => removeCartItem(it.id)));
      setItems([]);
      setSelectedIds([]);
      setClearOpen(false);
      void import("../store/cart").then((m) => m.useCart.getState().reloadServer());
    } catch {
      message.error(t("cart.clearFail"));
    }
  };

  const selectedCount = selectedIds.length;
  const selectedSubtotal = items
    .filter((it) => selectedIds.includes(it.id))
    .reduce((s, it) => s + Number(it.price) * it.quantity, 0);

  return (
    <div className="mx-auto" style={{ maxWidth: 1200 }}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ShoppingOutlined style={{ color: "#4F46E5" }} /> {t("cart.title")}
        </h1>
        {items.length > 0 && (
          <Popconfirm
            title={t("cart.confirmClear")}
            open={clearOpen}
            onConfirm={clearCart}
            onCancel={() => setClearOpen(false)}
            okText={t("common.ok")}
            cancelText={t("common.cancel")}
          >
            <Button danger icon={<DeleteOutlined />} onClick={() => setClearOpen(true)}>
              {t("cart.clearAll")}
            </Button>
          </Popconfirm>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Spin size="large" />
        </div>
      ) : items.length === 0 ? (
        <Empty description={t("cart.empty")} className="py-20">
          <Button type="primary" onClick={() => navigate("/")}>
            {t("cart.goShop")}
          </Button>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* 左：商品列表（粘性，结算栏随页面滚动） */}
          <div className="lg:col-span-2 lg:sticky lg:top-24 space-y-3">
            <div className="flex items-center justify-between bg-white rounded-2xl px-4 py-3 card-soft">
              <Checkbox checked={allChecked} onChange={(e) => toggleAll(e.target.checked)}>
                {t("cart.selectAll")}
              </Checkbox>
              <span className="text-slate-400 text-sm">
                {t("cart.selectedCount").replace("{n}", String(selectedCount))} · {t("cart.selectedAmount").replace("{x}", money(selectedSubtotal))}
              </span>
            </div>

            {items.map((it) => (
              <Card key={it.id} className="card-soft" styles={{ body: { padding: 16 } }}>
                <div className="flex items-center gap-4">
                  <Checkbox
                    checked={selectedIds.includes(it.id)}
                    onChange={(e) => toggle(it.id, e.target.checked)}
                  />
                  <Link to={`/products/${it.product_id}`}>
                    <img
                      src={it.image_url ? proxyImg(it.image_url) : undefined}
                      alt={it.name}
                      className="h-20 w-20 rounded-xl object-cover bg-slate-50"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/products/${it.product_id}`}
                      className="font-medium text-slate-800 hover:text-[#4F46E5] line-clamp-2"
                    >
                      {it.name}
                    </Link>
                    <div className="text-xs text-slate-400 mt-1">
                      ¥{money(it.price)} {it.stock != null && `· ${t("cart.stock")} ${it.stock}`}
                    </div>
                    {(it as any).variant_attrs && (it as any).variant_attrs.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(it as any).variant_attrs.map((v: any, i: number) => (
                          <Tag key={i} className="m-0">
                            {v.label}: {v.value}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    {editingId === it.id ? (
                      <div className="flex items-center gap-2">
                        <InputNumber
                          min={1}
                          max={99}
                          value={qtyInput}
                          onChange={(v) => setQtyInput(Number(v) || 1)}
                          size="small"
                          style={{ width: 70 }}
                        />
                        <Button size="small" type="primary" onClick={() => saveQty(it)}>
                          {t("common.ok")}
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="font-semibold text-slate-700 hover:text-[#4F46E5]"
                        onClick={() => {
                          setEditingId(it.id);
                          setQtyInput(it.quantity);
                        }}
                      >
                        ×{it.quantity}
                      </button>
                    )}
                    <div className="text-[#4F46E5] font-bold mt-1">
                      ¥{money(Number(it.price) * it.quantity)}
                    </div>
                  </div>
                  <Popconfirm
                    title={t("cart.confirmRemove")}
                    onConfirm={() => removeItem(it.id)}
                    okText={t("common.ok")}
                    cancelText={t("common.cancel")}
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </div>
              </Card>
            )            )}

            {/* T22：满减进度条 + 凑单入口（后端 preview.full_reduce_progress 按参与满减商品返回进度） */}
            {items.length > 0 && preview?.full_reduce_progress && preview.full_reduce_progress.length > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{t("cart.fullReduceTitle")}</span>
                  <button
                    className="text-xs font-medium text-[#4F46E5] hover:underline"
                    onClick={() => navigate("/market")}
                  >
                    {t("cart.bundleGo")}
                  </button>
                </div>
                <div className="space-y-2">
                  {preview.full_reduce_progress.map((tier, idx) => {
                    const pct =
                      tier.threshold > 0
                        ? Math.min(100, Math.round((tier.line_total / tier.threshold) * 100))
                        : tier.reached
                          ? 100
                          : 0;
                    return (
                      <div key={idx}>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span className="truncate pr-2" title={tier.title}>
                            {tier.title}
                          </span>
                          {tier.reached ? (
                            <span className="font-medium text-emerald-600 whitespace-nowrap">
                              {t("cart.fullReduceDone", { n: tier.value })}
                            </span>
                          ) : (
                            <span className="whitespace-nowrap">
                              {t("cart.bundleHint", { n: Math.max(0, Math.round(tier.threshold - tier.line_total)) })}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
              <SafetyOutlined style={{ color: "#4F46E5" }} />
              <span>{t("cart.safeTip")}</span>
              <Tooltip title={t("cart.recommendTip")}>
                <Button type="link" size="small" className="p-0" icon={<ReloadOutlined />} onClick={load}>
                  {t("cart.recommend")}
                </Button>
              </Tooltip>
            </div>
          </div>

          {/* 右：确认订单面板（独立组件，复用于 /checkout 确认订单页） */}
          <div className="lg:col-span-1">
            <div className="mb-2 flex items-center justify-end">
              <Button type="link" className="p-0" onClick={() => navigate("/checkout")}>
                {t("cart.goCheckout")} →
              </Button>
            </div>
            <CheckoutPanel
              items={items}
              selectedIds={selectedIds}
              onReload={load}
              variant="inline"
            />
          </div>
        </div>
      )}

      {!user && (
        <Modal
          open={true}
          footer={null}
          closable={false}
          centered
        >
          <div className="text-center py-4">
            <p className="mb-4 text-slate-600">{t("cart.loginTip")}</p>
            <Button type="primary" onClick={() => navigate("/login", { state: { from: "/cart" } })}>
              {t("common.login")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
