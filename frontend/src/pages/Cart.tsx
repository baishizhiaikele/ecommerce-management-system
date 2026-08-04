import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Checkbox,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Skeleton,
  Tag,
  Tooltip,
} from "antd";
import {
  DeleteOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyOutlined,
  ShoppingOutlined,
} from "@ant-design/icons";
import {
  addCartItem,
  getCart,
  removeCartItem,
  updateCartItem,
  getCartPreview,
  proxyImg,
  type CartItemOut,
  type CartPreview,
} from "../api";
import AsyncBoundary from "../components/AsyncBoundary";
import { getErrorMessage } from "../api/client";
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
  // 加载失败必须与"购物车为空"区分开，否则用户会误以为商品丢了
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [preview, setPreview] = useState<CartPreview | null>(null);
  // 正在提交数量/删除的行，用于禁用按钮防止重复点击
  const [busyIds, setBusyIds] = useState<string[]>([]);

  const setBusy = (id: string, busy: boolean) =>
    setBusyIds((s) => (busy ? [...s, id] : s.filter((x) => x !== id)));

  // 组件首次挂载就刷新购物车角标
  useEffect(() => {
    void import("../store/cart").then((m) => m.useCart.getState().reloadServer());
  }, []);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
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
      // 只记录到页面错误态，不再弹 toast：整页已有明确的失败提示和重试按钮
      setLoadError(getErrorMessage(e, t("cart.loadFail")));
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

  const syncBadge = () =>
    void import("../store/cart").then((m) => m.useCart.getState().reloadServer());

  /** 误删是购物车最高频的挫败点，删除后给一次“撤销”机会而不是直接消失 */
  const removeItem = async (it: CartItemOut) => {
    setBusy(it.id, true);
    try {
      await removeCartItem(it.id);
      setItems((s) => s.filter((x) => x.id !== it.id));
      setSelectedIds((s) => s.filter((x) => x !== it.id));
      syncBadge();
      const wasSelected = selectedIds.includes(it.id);
      const key = `undo-${it.id}`;
      message.open({
        key,
        type: "success",
        duration: 6,
        content: (
          <span className="inline-flex items-center gap-3">
            {t("cart.removed", { name: it.name })}
            <Button
              size="small"
              type="link"
              className="p-0"
              onClick={async () => {
                message.destroy(key);
                try {
                  await addCartItem({
                    product_id: it.product_id,
                    quantity: it.quantity,
                    // 保留规格，否则撤销后恢复的是错误的 SKU
                    variant_id: it.variant_id ?? undefined,
                  });
                  await load();
                  if (wasSelected) setSelectedIds((s) => [...s, it.id]);
                  message.success(t("cart.restored"));
                } catch (e) {
                  message.error(getErrorMessage(e, t("cart.restoreFail")));
                }
              }}
            >
              {t("common.undo")}
            </Button>
          </span>
        ),
      });
    } catch (e) {
      message.error(getErrorMessage(e, t("cart.removeFail")));
    } finally {
      setBusy(it.id, false);
    }
  };

  /** 直接加减，省去“点数字→输入→确认”三步操作 */
  const changeQty = async (it: CartItemOut, next: number) => {
    const q = Math.max(1, Math.min(99, Math.floor(next || 1)));
    if (q === it.quantity) return;
    const prev = it.quantity;
    // 乐观更新，失败再回滚，避免每次加减都等一个网络往返
    setItems((s) => s.map((x) => (x.id === it.id ? { ...x, quantity: q } : x)));
    setBusy(it.id, true);
    try {
      await updateCartItem(it.id, q);
      syncBadge();
      const pv = await getCartPreview().catch(() => null);
      if (pv) setPreview(pv);
    } catch (e) {
      setItems((s) => s.map((x) => (x.id === it.id ? { ...x, quantity: prev } : x)));
      message.error(getErrorMessage(e, t("cart.updateFail")));
    } finally {
      setBusy(it.id, false);
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

      <AsyncBoundary
        loading={loading}
        error={loadError}
        retry={load}
        isEmpty={items.length === 0}
        emptyTitle={t("cart.empty")}
        emptyDescription={t("cart.emptyDesc")}
        emptyAction={
          <Button type="primary" onClick={() => navigate("/")}>
            {t("cart.goShop")}
          </Button>
        }
        skeleton={
          <div className="space-y-3 py-4">
            {[0, 1, 2].map((i) => (
              <Card key={i} className="card-soft" styles={{ body: { padding: 16 } }}>
                <Skeleton active avatar={{ shape: "square", size: 80 }} paragraph={{ rows: 2 }} />
              </Card>
            ))}
          </div>
        }
      >
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
                    aria-label={t("cart.selectItem", { name: it.name })}
                  />
                  <Link to={`/products/${it.product_id}`} tabIndex={-1} aria-hidden="true">
                    <img
                      src={it.image_url ? proxyImg(it.image_url) : undefined}
                      alt=""
                      loading="lazy"
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
                    {it.variant_attrs && it.variant_attrs.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {it.variant_attrs.map((v, i) => (
                          <Tag key={i} className="m-0">
                            {v.label}: {v.value}
                          </Tag>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="small"
                        icon={<MinusOutlined />}
                        disabled={it.quantity <= 1 || busyIds.includes(it.id)}
                        aria-label={t("cart.decrease", { name: it.name })}
                        onClick={() => changeQty(it, it.quantity - 1)}
                      />
                      <InputNumber
                        min={1}
                        max={99}
                        value={it.quantity}
                        size="small"
                        style={{ width: 56 }}
                        controls={false}
                        disabled={busyIds.includes(it.id)}
                        aria-label={t("cart.qtyOf", { name: it.name })}
                        onChange={(v) => {
                          if (v != null) changeQty(it, Number(v));
                        }}
                      />
                      <Button
                        size="small"
                        icon={<PlusOutlined />}
                        disabled={
                          busyIds.includes(it.id) ||
                          it.quantity >= 99 ||
                          (it.stock != null && it.quantity >= it.stock)
                        }
                        aria-label={t("cart.increase", { name: it.name })}
                        onClick={() => changeQty(it, it.quantity + 1)}
                      />
                    </div>
                    <div className="text-[#4F46E5] font-bold mt-1" aria-live="polite">
                      ¥{money(Number(it.price) * it.quantity)}
                    </div>
                  </div>
                  <Popconfirm
                    title={t("cart.confirmRemove")}
                    onConfirm={() => removeItem(it)}
                    okText={t("common.ok")}
                    cancelText={t("common.cancel")}
                  >
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      loading={busyIds.includes(it.id)}
                      aria-label={t("cart.removeItem", { name: it.name })}
                    />
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
      </AsyncBoundary>

      {!user && (
        <Modal
          open={true}
          footer={null}
          closable={false}
          centered
          maskClosable={false}
          title={t("cart.loginTitle")}
        >
          <div className="text-center py-4">
            <p className="mb-4 text-slate-600">{t("cart.loginTip")}</p>
            <div className="flex items-center justify-center gap-2">
              <Button onClick={() => navigate("/")}>{t("cart.keepBrowsing")}</Button>
              <Button
                type="primary"
                autoFocus
                onClick={() => navigate("/login", { state: { from: "/cart" } })}
              >
                {t("common.login")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
