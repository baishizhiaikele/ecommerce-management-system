import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Tag,
  message,
  Card,
  Input,
  Popconfirm,
  Progress,
  Select,
  Drawer,
  Spin,
  Empty,
} from "antd";
import {
  checkout,
  myCoupons,
  listCategories,
  listAddresses,
  getCartPreview,
  getBundleSuggestions,
  proxyImg,
  type UserCouponOut,
  type CategoryOut,
  type AddressOut,
  type CartPreview,
  type BundleSuggestion,
  type CartItemOut,
} from "../api";
import { money } from "../utils/format";
import { calcSubtotal, calcCouponDiscount, calcPointsDiscount, calcPayable } from "../utils/cart";
import { getErrorMessage } from "../api/client";
import { swallow } from "../utils/reportError";
import { useCart } from "../store/cart";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";
import { useCallback } from "react";

interface CheckoutPanelProps {
  items: CartItemOut[];
  selectedIds: string[];
  onReload: () => void;
  /** inline：购物车页内嵌右侧栏；page：独立确认订单页整页展示 */
  variant?: "inline" | "page";
}

/**
 * 结算/确认订单面板。购物车页（inline）与独立 /checkout 确认订单页（page）共用同一份逻辑，
 * 保证「购物车 → 确认订单」两步流程的费用明细、优惠、地址、配送方式完全一致，避免逻辑分叉。
 */
export default function CheckoutPanel({ items, selectedIds, onReload, variant = "inline" }: CheckoutPanelProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const clear = useCart((s) => s.clear);
  const points = useAuth((s) => s.user?.points ?? 0);

  const [coupons, setCoupons] = useState<UserCouponOut[]>([]);
  const [couponId, setCouponId] = useState<string>();
  const [usePoints, setUsePoints] = useState(false);
  const [deliveryType, setDeliveryType] = useState<"express" | "pickup">("express");
  const [pickupStore, setPickupStore] = useState("");
  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [address, setAddress] = useState("");
  const [addresses, setAddresses] = useState<AddressOut[]>([]);
  const [selAddrId, setSelAddrId] = useState<string>();
  const [preview, setPreview] = useState<CartPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [bundleList, setBundleList] = useState<BundleSuggestion[]>([]);
  const [bundleLoading, setBundleLoading] = useState(false);

  const formatAddr = (a: AddressOut) =>
    `${a.receiver} ${a.phone} ${a.province}${a.city}${a.district}${a.detail}`;

  // 仅当本面板被独立使用时才自行拉取依赖；购物车页 inline 模式下由父级提供数据更高效。
  const loadDeps = useCallback(async () => {
    try {
      const [mine, cats, addrs, pv] = await Promise.all([
        myCoupons(),
        listCategories(),
        listAddresses(),
        getCartPreview().catch(() => null),
      ]);
      setCoupons(mine.filter((c) => !c.is_used));
      setCategories(cats);
      setPreview(pv);
      setAddresses(addrs);
      const def = addrs.find((a) => a.is_default) || addrs[0];
      if (def) {
        setSelAddrId(def.id);
        setAddress(formatAddr(def));
      }
    } catch (e) {
      swallow(e, "CheckoutPanel.loadDeps");
    }
  }, []);

  useEffect(() => {
    if (variant === "page") loadDeps();
  }, [variant, loadDeps]);

  const selectedItems = items.filter((it) => selectedIds.includes(it.id));
  const cartCategorySlugs = (() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const slugs = new Set<string>();
    for (const it of selectedItems) {
      let cur = it.category_id ? byId.get(it.category_id) : undefined;
      if (!cur) continue;
      while (cur.parent_id) {
        const p = byId.get(cur.parent_id);
        if (!p) break;
        cur = p;
      }
      slugs.add(cur.slug);
    }
    return slugs;
  })();
  const cartMerchantIds = new Set(
    selectedItems.map((it) => it.merchant_id).filter(Boolean) as string[],
  );

  // 品类名称通过 i18n 键读取，未覆盖时回退为 slug 本身
  const categoryName = (slug?: string | null): string => {
    if (!slug) return "";
    const key = `category.${slug}`;
    const label = t(key);
    return label === key ? slug : label;
  };

  const couponCheck = (c: UserCouponOut): { ok: boolean; reason: string } => {
    if (c.expire_at && new Date(c.expire_at).getTime() < Date.now())
      return { ok: false, reason: t("coupon.expired") };
    if (c.applicable_category && !cartCategorySlugs.has(c.applicable_category))
      return { ok: false, reason: t("cart.couponMismatchCategory") };
    if (c.merchant_id && !cartMerchantIds.has(c.merchant_id))
      return { ok: false, reason: t("cart.couponMismatchMerchant") };
    if (Number(c.threshold) > 0 && subtotal < Number(c.threshold))
      return { ok: false, reason: t("cart.couponNotEnough") };
    return { ok: true, reason: "" };
  };
  const couponApplicable = (c: UserCouponOut): boolean => couponCheck(c).ok;

  const subtotal = calcSubtotal(selectedItems);
  const selCoupon = coupons.find((c) => c.id === couponId);
  const cDisc = calcCouponDiscount(selCoupon, subtotal);
  const pDisc = calcPointsDiscount(points, subtotal, usePoints);
  const payable = calcPayable(subtotal, cDisc, pDisc);

  const estDate = (() => {
    const d = new Date(Date.now() + 3 * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const assembleGap = (() => {
    const cands = coupons
      .filter(couponApplicable)
      .filter((c) => c.type === "full_reduce" && c.threshold && subtotal < Number(c.threshold));
    if (cands.length === 0) return null;
    return Math.min(...cands.map((c) => (Number(c.threshold) || 0) - subtotal));
  })();
  const bundleGap = (() => {
    if (preview?.coupon_progress?.gap) return preview.coupon_progress.gap;
    if (assembleGap != null) return assembleGap;
    const gaps = (preview?.full_reduce_progress || []).filter((p) => !p.reached).map((p) => p.gap);
    return gaps.length ? Math.min(...gaps) : null;
  })();
  const bundleHint = preview?.coupon_progress
    ? `${preview.coupon_progress.name}（满${money(preview.coupon_progress.threshold)}减${money(preview.coupon_progress.value)}）`
    : preview?.full_reduce_progress?.find((p) => !p.reached)?.title || "";

  const openBundle = async () => {
    setBundleOpen(true);
    setBundleLoading(true);
    try {
      const list = await getBundleSuggestions(bundleGap || 0);
      setBundleList(list);
    } catch {
      message.error(t("cart.bundleFail") || t("common.operationFailed"));
    } finally {
      setBundleLoading(false);
    }
  };
  const applyBest = () => {
    if (selectedItems.length === 0) {
      message.warning(t("cart.pleaseSelect"));
      return;
    }
    const applicable = coupons.filter(couponApplicable);
    let best: UserCouponOut | undefined;
    let bestDisc = -1;
    for (const c of applicable) {
      const d = calcCouponDiscount(c, subtotal);
      if (d > bestDisc) {
        bestDisc = d;
        best = c;
      }
    }
    if (best && bestDisc > 0) {
      setCouponId(best.id);
      message.success(t("cart.bestCouponOn"));
    } else {
      message.info(t("cart.noCoupon"));
    }
  };

  const onCheckout = async () => {
    if (selectedIds.length === 0) {
      message.warning(t("cart.pleaseSelect"));
      return;
    }
    if (!address.trim()) {
      message.warning(t("cart.needAddress"));
      return;
    }
    if (deliveryType === "pickup" && !pickupStore.trim()) {
      message.warning(t("cart.pickupStoreRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const selAddr =
        addresses.find((a) => a.id === selAddrId) ||
        (addresses[0] && address.trim() ? addresses[0] : undefined);
      const receiver = selAddr?.receiver ?? "";
      const phone = selAddr?.phone ?? "";
      if (!receiver || !phone) {
        message.warning(t("cart.receiverRequired"));
        setSubmitting(false);
        return;
      }
      const liveRoomId = localStorage.getItem("live_room_id") || undefined;
      const order = await checkout(address.trim(), {
        receiver: receiver.trim(),
        contact: phone.trim(),
        coupon_id: couponId,
        use_points: usePoints,
        delivery_type: deliveryType,
        pickup_store: deliveryType === "pickup" ? pickupStore.trim() : undefined,
        cart_item_ids: selectedIds,
        live_room_id: liveRoomId,
      });
      if (liveRoomId) localStorage.removeItem("live_room_id");
      clear();
      message.success(t("cart.orderSuccess"));
      navigate(`/orders/${order.id}`);
    } catch (e) {
      message.error(getErrorMessage(e, t("cart.orderFail")));
    } finally {
      setSubmitting(false);
    }
  };

  const body = (
    <div className="space-y-4">
      {/* 优惠券 */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <span className="text-slate-600 whitespace-nowrap pt-1.5">{t("cart.coupon")}</span>
        <div className="flex items-center gap-2">
          <Select
            style={{ width: 220 }}
            placeholder={t("cart.noCoupon")}
            allowClear
            value={couponId}
            onChange={(v) => setCouponId(v)}
            options={coupons.map((c) => {
              const chk = couponCheck(c);
              const benefit =
                c.type === "discount"
                  ? t("coupon.discountHint2").replace("{value}", String(Number(c.value) * 10))
                  : t("coupon.discountHint")
                      .replace("{threshold}", String(c.threshold))
                      .replace("{value}", String(c.value));
              const scope =
                c.merchant_id
                  ? t("coupon.scope.shop")
                  : c.applicable_category
                    ? `${t("coupon.scope.category")}：${categoryName(c.applicable_category)}`
                    : t("coupon.scope.platform");
              const expire = c.expire_at ? new Date(c.expire_at).toLocaleDateString() : "";
              const sub = [benefit, scope, expire ? `${t("coupon.expireAt")}:${expire}` : ""]
                .filter(Boolean)
                .join(" · ");
              return {
                value: c.id,
                label: chk.ok ? `${c.name}（${sub}）` : `${c.name}（${sub} · ${chk.reason}）`,
                disabled: !chk.ok,
              };
            })}
          />
          <Button size="small" onClick={applyBest}>
            {t("cart.useBest")}
          </Button>
        </div>
      </div>

      {assembleGap != null && (
        <div className="text-xs text-orange-500">
          🎯 {t("cart.assembleHint").replace("{n}", money(assembleGap))}
        </div>
      )}
      {bundleGap != null && (
        <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-orange-600">
              🎯 {t("cart.bundleHint").replace("{n}", money(bundleGap))}
              {bundleHint ? ` · ${bundleHint}` : ""}
            </span>
            <Button size="small" type="primary" ghost onClick={openBundle}>
              {t("cart.bundleGo")}
            </Button>
          </div>
          {preview?.full_reduce_progress?.map((p) => (
            <div key={p.product_id} className="mt-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="truncate max-w-[60%]">{p.title}</span>
                <span>{p.reached ? t("cart.fullReduceReached", { amount: money(p.value) }) : t("cart.fullReduceGap", { amount: money(p.gap) })}</span>
              </div>
              <Progress
                percent={p.threshold > 0 ? Math.min(100, Math.round((p.line_total / p.threshold) * 100)) : 100}
                showInfo={false}
                size="small"
                strokeColor="#f97316"
              />
            </div>
          ))}
        </div>
      )}

      {/* 积分抵扣 */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-600">
          {t("cart.usePoints")}
          <Tag className="ml-2" color="orange">
            {t("cart.pointsAvailable").replace("{n}", String(points))}（约 ¥{(points / 100).toFixed(2)}）
          </Tag>
        </span>
        <Popconfirm
          title={t("cart.pointsConfirm")}
          open={undefined}
          disabled
        >
          <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
        </Popconfirm>
      </div>

      {/* 金额构成逐项列出 */}
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">{t("cart.itemsSubtotal")}</span>
          <span className="text-slate-700">¥{money(subtotal)}</span>
        </div>
        {cDisc > 0 && selCoupon && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">{t("cart.couponDiscount")}（{selCoupon.name}）</span>
            <span className="text-emerald-600">-¥{money(cDisc)}</span>
          </div>
        )}
        {pDisc > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-slate-500">{t("cart.pointsDiscount")}</span>
            <span className="text-emerald-600">-¥{money(pDisc)}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-slate-500">{t("cart.shipping")}</span>
          <span className="text-emerald-600">{t("cart.freeShipping")}</span>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 mt-3 pt-3">
        <span className="text-slate-500">{t("cart.finalPrice")}</span>
        <div className="flex items-center gap-2">
          {cDisc + pDisc > 0 && (
            <span className="text-slate-400 text-sm line-through">¥{money(subtotal)}</span>
          )}
          <span className="text-[#4F46E5] font-bold text-2xl">¥{money(payable)}</span>
        </div>
      </div>
      {cDisc + pDisc > 0 && (
        <div className="text-right text-sm text-emerald-600">
          {t("cart.saved").replace("{x}", money(cDisc + pDisc))}
        </div>
      )}

      {/* 配送方式 */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-slate-600 whitespace-nowrap">{t("cart.deliveryType")}</span>
        <Select
          style={{ width: 200 }}
          value={deliveryType}
          onChange={(v) => setDeliveryType(v)}
          options={[
            { value: "express", label: t("cart.deliveryExpress") },
            { value: "pickup", label: t("cart.deliveryPickup") },
          ]}
        />
      </div>
      {deliveryType === "pickup" && (
        <Input
          placeholder={t("cart.pickupStorePlaceholder")}
          value={pickupStore}
          onChange={(e) => setPickupStore(e.target.value)}
          maxLength={200}
        />
      )}
      {deliveryType === "pickup" ? (
        <Input.TextArea
          rows={2}
          placeholder={t("cart.contactPlaceholder")}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={500}
        />
      ) : addresses.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-slate-600 text-sm">{t("cart.addressSelect")}</span>
            <Button type="link" size="small" className="p-0" onClick={() => navigate("/addresses")}>
              {t("cart.manageAddress")}
            </Button>
          </div>
          <Select
            style={{ width: "100%" }}
            placeholder={t("cart.addressSelectPlaceholder")}
            value={selAddrId}
            onChange={(v) => {
              setSelAddrId(v);
              const a = addresses.find((x) => x.id === v);
              if (a) setAddress(formatAddr(a));
            }}
            options={addresses.map((a) => ({
              value: a.id,
              label: `${a.receiver} ${a.phone} ${a.province}${a.city}${a.district}${a.detail || ""}`,
            }))}
          />
          <div className="text-xs text-slate-400 mt-1">
            📦 {t("cart.estDelivery").replace("{date}", estDate)} · {t("cart.cutoff")}
          </div>
        </div>
      ) : (
        <Input.TextArea
          rows={2}
          placeholder={t("cart.addressPlaceholder")}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={500}
        />
      )}

      <Button type="primary" block className="mt-3" loading={submitting} onClick={onCheckout}>
        {t("cart.submit")}
      </Button>

      <BundleDrawer
        open={bundleOpen}
        loading={bundleLoading}
        list={bundleList}
        onClose={() => setBundleOpen(false)}
        onAdd={async (p) => {
          const { addCartItem } = await import("../api");
          try {
            await addCartItem({ product_id: p.id, quantity: 1 });
            message.success(t("cart.added"));
            onReload();
            if (variant === "page") loadDeps();
          } catch {
            message.error(t("cart.bundleFail") || t("common.operationFailed"));
          }
        }}
      />
    </div>
  );

  if (variant === "page") {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="text-sm text-slate-400 mb-3">
          <a className="cursor-pointer hover:text-indigo-600" onClick={() => navigate("/cart")}>
            {t("cart.title")}
          </a>
          <span className="mx-2">/</span>
          <span className="text-slate-600">{t("cart.checkoutTitle")}</span>
        </div>
        <Card title={t("cart.checkoutTitle")} className="card-soft">
          {body}
        </Card>
      </div>
    );
  }
  return <Card title={t("cart.checkoutTitle")} className="card-soft">{body}</Card>;
}

function BundleDrawer({
  open,
  loading,
  list,
  onClose,
  onAdd,
}: {
  open: boolean;
  loading: boolean;
  list: BundleSuggestion[];
  onClose: () => void;
  onAdd: (p: BundleSuggestion) => void;
}) {
  const { t } = useI18n();
  return (
    <Drawer title={t("cart.bundleDrawerTitle")} placement="right" width={360} open={open} onClose={onClose}>
      {loading ? (
        <Spin />
      ) : list.length === 0 ? (
        <Empty description={t("cart.bundleEmpty")} />
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-2">
              <img
                src={p.image_url ? proxyImg(p.image_url) : undefined}
                alt={p.name}
                className="h-14 w-14 rounded object-cover bg-slate-50"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-700">{p.name}</div>
                <div className="text-xs text-slate-400">
                  ¥{money(p.price)} · {t("cart.bundleProjected").replace("{n}", money(p.projected_total))}
                </div>
              </div>
              <Button size="small" type="primary" onClick={() => onAdd(p)}>
                {t("cart.add")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
