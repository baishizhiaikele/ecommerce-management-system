import { useEffect, useState, type Key } from "react";
import type { AxiosError } from "axios";
import { useNavigate } from "react-router-dom";
import {
  Table,
  Button,
  InputNumber,
  Tag,
  message,
  Card,
  Input,
  Popconfirm,
  Empty,
  Spin,
} from "antd";
import {
  getCart,
  updateCartItem,
  removeCartItem,
  checkout,
  myCoupons,
  listCategories,
  listAddresses,
  CartItemOut,
  UserCouponOut,
  CategoryOut,
  AddressOut,
} from "../api";
import { money } from "../utils/format";
import { calcSubtotal, calcCouponDiscount, calcPointsDiscount, calcPayable } from "../utils/cart";
import { useCart } from "../store/cart";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";
import { Checkbox, Select } from "antd";

export default function Cart() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const clear = useCart((s) => s.clear);
  const points = useAuth((s) => s.user?.points ?? 0);
  const [items, setItems] = useState<CartItemOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [coupons, setCoupons] = useState<UserCouponOut[]>([]);
  const [couponId, setCouponId] = useState<string>();
  const [usePoints, setUsePoints] = useState(false);
  const [deliveryType, setDeliveryType] = useState<"express" | "pickup">("express");
  const [pickupStore, setPickupStore] = useState("");
  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [addresses, setAddresses] = useState<AddressOut[]>([]);
  const [selAddrId, setSelAddrId] = useState<string>();
  const formatAddr = (a: AddressOut) =>
    `${a.receiver} ${a.phone} ${a.province}${a.city}${a.district}${a.detail}`;

  const load = async () => {
    setLoading(true);
    try {
      const [cart, mine, cats, addrs] = await Promise.all([
        getCart(),
        myCoupons(),
        listCategories(),
        listAddresses(),
      ]);
      setItems(cart);
      setSelectedIds((prev) => prev.filter((id) => cart.some((it) => it.id === id)));
      setCoupons(mine.filter((c) => !c.is_used));
      setCategories(cats);
      setAddresses(addrs);
      const def = addrs.find((a) => a.is_default) || addrs[0];
      if (def) {
        setSelAddrId(def.id);
        setAddress(formatAddr(def));
      }
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };

  // 把购物车商品的 category_id 解析为「顶级品类 slug」集合 + 涉及商家集合，
  // 用于在前端提前过滤商家券/品类券的适用范围（文创券不能用于耳机等）。
  const selectedItems = items.filter((it) => selectedIds.includes(it.id));
  const rowSelection = {
    selectedRowKeys: selectedIds,
    onChange: (keys: Key[]) => setSelectedIds(keys.map(String)),
  };
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

  const couponApplicable = (c: UserCouponOut): boolean => {
    if (c.applicable_category && !cartCategorySlugs.has(c.applicable_category)) return false;
    if (c.merchant_id && !cartMerchantIds.has(c.merchant_id)) return false;
    return true;
  };
  useEffect(() => {
    load();
  }, []);

  const changeQty = async (id: string, q: number) => {
    try {
      await updateCartItem(id, q);
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("cart.updateFail"));
    }
  };
  const remove = async (id: string) => {
    try {
      await removeCartItem(id);
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };
  const removeSelected = async () => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map((id) => removeCartItem(id)));
      setSelectedIds([]);
      await load();
      message.success(t("cart.batchDeleteSuccess"));
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
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
      const order = await checkout(address.trim(), {
        receiver: receiver.trim(),
        contact: phone.trim(),
        coupon_id: couponId,
        use_points: usePoints,
        delivery_type: deliveryType,
        pickup_store: deliveryType === "pickup" ? pickupStore.trim() : undefined,
        cart_item_ids: selectedIds,
      });
      clear();
      message.success(t("cart.orderSuccess"));
      navigate(`/orders/${order.id}`);
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("cart.orderFail"));
    } finally {
      setSubmitting(false);
    }
  };

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
      .filter((c) => c.type === "discount" && c.threshold && subtotal < c.threshold);
    if (cands.length === 0) return null;
    return Math.min(...cands.map((c) => (c.threshold ?? 0) - subtotal));
  })();
  // 前端计算最优券（后端暂无 best 接口），取可适用且优惠力度最大者
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

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (items.length === 0) return <Empty description={t("cart.empty")} className="py-20" />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <Card title={t("cart.title")} className="rounded-2xl shadow-sm border-0 lg:col-span-2">
        <Table
          dataSource={items}
          rowKey="id"
          rowSelection={rowSelection}
          title={() => (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={items.length > 0 && selectedIds.length === items.length}
                  indeterminate={selectedIds.length > 0 && selectedIds.length < items.length}
                  onChange={(e) => setSelectedIds(e.target.checked ? items.map((it) => it.id) : [])}
                >
                  {t("cart.selectAll")}
                </Checkbox>
                <span className="text-slate-400 text-sm">
                  {t("cart.selectedCount").replace("{n}", String(selectedItems.length))}
                </span>
              </div>
              <Popconfirm
                title={t("cart.batchDeleteConfirm").replace("{n}", String(selectedIds.length))}
                disabled={selectedIds.length === 0}
                onConfirm={removeSelected}
              >
                <Button danger size="small" disabled={selectedIds.length === 0}>
                  {t("cart.batchDelete")}
                </Button>
              </Popconfirm>
            </div>
          )}
          pagination={false}
          size="middle"
          scroll={{ x: "max-content" }}
          columns={[
            {
              title: "",
              dataIndex: "image_url",
              width: 72,
              render: (src: string | null | undefined, r) => (
                <img
                  src={src || "/placeholder.png"}
                  alt={r.name}
                  onClick={() => navigate(`/products/${r.product_id}`)}
                  className="w-14 h-14 object-cover rounded-lg cursor-pointer hover:opacity-80 transition"
                />
              ),
            },
            {
              title: t("col.product"),
              dataIndex: "name",
              render: (name: string, r) => (
                <a
                  className="text-slate-800 hover:text-[#4F46E5] font-medium cursor-pointer"
                  onClick={() => navigate(`/products/${r.product_id}`)}
                >
                  {name}
                </a>
              ),
            },
            {
              title: t("col.spec"),
              dataIndex: "variant_label",
              render: (v: string | null | undefined) =>
                v ? <Tag color="blue">{v}</Tag> : <span className="text-slate-400">—</span>,
            },
            {
              title: t("col.price"),
              dataIndex: "price",
              render: (v, r) => (
                <span className="inline-flex items-center gap-1">
                  {r.is_flash && (
                    <Tag color="volcano" className="mr-0 leading-none">
                      {t("cart.flash")}
                    </Tag>
                  )}
                  <span className="font-semibold text-[#ff4d4f]">¥{money(v)}</span>
                  {r.is_flash && r.original != null && Number(r.original) > Number(v) && (
                    <span className="text-xs text-slate-400 line-through">¥{money(r.original)}</span>
                  )}
                </span>
              ),
            },
            {
              title: t("col.qty"),
              render: (_, r) => (
                <InputNumber
                  min={1}
                  max={r.stock}
                  value={r.quantity}
                  onChange={(v) => v && changeQty(r.id, v)}
                />
              ),
            },
            { title: t("col.subtotal"), render: (_, r) => `¥${money(Number(r.price) * r.quantity)}` },
            {
              title: t("common.action"),
              fixed: "right",
              render: (_, r) => (
                <Popconfirm title={t("common.confirmDelete")} onConfirm={() => remove(r.id)}>
                  <Button type="link" danger>
                    {t("common.delete")}
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>

      <div className="lg:col-span-1 lg:sticky lg:top-6 space-y-4">
        <Card title={t("cart.checkoutTitle")} className="card-soft">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-slate-600 whitespace-nowrap">{t("cart.coupon")}</span>
              <div className="flex items-center gap-2">
                <Select
                  style={{ width: 200 }}
                  placeholder={t("cart.noCoupon")}
                  allowClear
                  value={couponId}
                  onChange={(v) => setCouponId(v)}
                  options={coupons.map((c) => {
                    const ok = couponApplicable(c);
                    const hint =
                      c.type === "discount"
                        ? t("coupon.type.discount")
                        : t("coupon.discountHint")
                            .replace("{threshold}", c.threshold)
                            .replace("{value}", c.value);
                    return {
                      value: c.id,
                      label: ok
                        ? `${c.name}（${hint}）`
                        : `${c.name}（${hint} · ${t("cart.couponNotApplicable")}）`,
                      disabled: !ok,
                    };
                  })}
                />
                <Button size="small" onClick={applyBest}>
                  {t("cart.useBest")}
                </Button>
              </div>
            </div>
            {assembleGap != null && (
              <div className="text-xs text-orange-500 mt-1">
                🎯 {t("cart.assembleHint").replace("{n}", money(assembleGap))}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600">
                {t("cart.usePoints")}
                <Tag className="ml-2" color="orange">
                  {t("cart.pointsAvailable").replace("{n}", String(points))}（约 ¥{(points / 100).toFixed(2)}）
                </Tag>
              </span>
              <Checkbox checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)}>
                {t("cart.deduct")} {pDisc ? `¥${pDisc.toFixed(2)}` : t("cart.zeroYuan")}
              </Checkbox>
            </div>
          </div>
        </Card>

        <Card className="card-soft">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">{t("cart.finalPrice")}</span>
            <div className="flex items-center gap-2">
              {cDisc + pDisc > 0 && (
                <span className="text-slate-400 text-sm line-through">¥{money(subtotal)}</span>
              )}
              <span className="text-[#4F46E5] font-bold text-2xl">¥{money(payable)}</span>
            </div>
          </div>
          {cDisc + pDisc > 0 && (
            <div className="text-right text-sm text-emerald-600 mt-1">
              {t("cart.saved").replace("{x}", money(cDisc + pDisc))}
            </div>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
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
              className="mt-3"
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
              className="mt-4"
            />
          ) : addresses.length > 0 ? (
            <div className="mt-4">
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
              className="mt-4"
            />
          )}
          <Button type="primary" block className="mt-3" loading={submitting} onClick={onCheckout}>
            {t("cart.submit")}
          </Button>
        </Card>
      </div>
    </div>
  );
}
