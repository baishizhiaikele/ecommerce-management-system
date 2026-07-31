import { useEffect, useRef, useState, type Key } from "react";
import type { AxiosError } from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Table,
  Button,
  InputNumber,
  Tag,
  message,
  notification,
  Card,
  Input,
  Popconfirm,
  Empty,
  Result,
  Spin,
  Drawer,
  Progress,
} from "antd";
import { ReloadOutlined, GiftOutlined } from "@ant-design/icons";
import {
  getCart,
  updateCartItem,
  removeCartItem,
  addCartItem,
  checkout,
  myCoupons,
  listCategories,
  listAddresses,
  getErrorMessage,
  getCartPreview,
  getBundleSuggestions,
  proxyImg,
  CartItemOut,
  UserCouponOut,
  CategoryOut,
  AddressOut,
  CartPreview,
  BundleSuggestion,
} from "../api";
import { money } from "../utils/format";
import { calcSubtotal, calcCouponDiscount, calcPointsDiscount, calcPayable } from "../utils/cart";
import { useCart } from "../store/cart";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";
import { Checkbox, Select } from "antd";

export default function Cart() {
  const navigate = useNavigate();
  const location = useLocation();
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
  const selectionInitedRef = useRef(false);
  // 防抖：记录每个条目的在途定时器与目标数量，避免连续点击重复发请求
  const pendingRef = useRef<Map<string, { timer: number; qty: number }>>(new Map());
  // 最近一次与服务端一致的数量，失败回滚用
  const lastOkQtyRef = useRef<Record<string, number>>({});
  const [addresses, setAddresses] = useState<AddressOut[]>([]);
  const [selAddrId, setSelAddrId] = useState<string>();
  // P1-2 凑单进度：后端算价预览（满减活动进度 + 满减券进度）
  const [preview, setPreview] = useState<CartPreview | null>(null);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [bundleList, setBundleList] = useState<BundleSuggestion[]>([]);
  const [bundleLoading, setBundleLoading] = useState(false);
  // 删除撤销：暂存"已被乐观隐藏、待真实删除"的条目与其在原列表中的下标，
  // 撤销时恢复原位，避免列表顺序抖动。
  const hiddenRef = useRef<Record<string, CartItemOut>>({});
  const hiddenIndexRef = useRef<Record<string, number>>({});
  const undoTimersRef = useRef<Record<string, number>>({});
  const formatAddr = (a: AddressOut) =>
    `${a.receiver} ${a.phone} ${a.province}${a.city}${a.district}${a.detail}`;

  const [loadError, setLoadError] = useState<string | null>(null);
  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [cart, mine, cats, addrs, pv] = await Promise.all([
        getCart(),
        myCoupons(),
        listCategories(),
        listAddresses(),
        getCartPreview().catch(() => null),
      ]);
      setItems(cart);
      setPreview(pv);
      lastOkQtyRef.current = Object.fromEntries(cart.map((it) => [it.id, it.quantity]));
      // 从商品详情「立即购买」进来时只勾选该商品；否则首次进入默认全选，
      // 避免用户点结算才发现"未选择商品"。之后只剔除已不存在的条目，不覆盖手动取消
      const buyNowProductId = (location.state as { buyNowProductId?: string } | null)
        ?.buyNowProductId;
      setSelectedIds((prev) => {
        if (buyNowProductId) {
          const hit = cart.filter((it) => it.product_id === buyNowProductId).map((it) => it.id);
          if (hit.length) {
            selectionInitedRef.current = true;
            return hit;
          }
        }
        if (!selectionInitedRef.current) {
          selectionInitedRef.current = true;
          return cart.map((it) => it.id);
        }
        return prev.filter((id) => cart.some((it) => it.id === id));
      });
      setCoupons(mine.filter((c) => !c.is_used));
      setCategories(cats);
      setAddresses(addrs);
      const def = addrs.find((a) => a.is_default) || addrs[0];
      if (def) {
        setSelAddrId(def.id);
        setAddress(formatAddr(def));
      }
    } catch (e) {
      setLoadError(getErrorMessage(e));
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

  // 与后端 compute_discount / find_usable_user_coupon 对齐：校验适用范围（品类/商家）、
  // 满减门槛与有效期，返回 { ok, reason }，reason 用于向用户说明为何不可用。
  // 过期券直接判不可用，避免「最优惠券」把无效券推荐给用户。
  const couponCheck = (
    c: UserCouponOut,
  ): { ok: boolean; reason: string } => {
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
  // 每次进入购物车路由时重新拉取最新数据（加购后切换回来能看到）
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // 卸载前把最后一次（尚未防抖发出的）数量尽力同步给后端，避免丢失
  useEffect(() => {
    return () => {
      pendingRef.current.forEach((entry, id) => {
        if (entry.timer) clearTimeout(entry.timer);
        updateCartItem(id, entry.qty).catch(() => {});
      });
      pendingRef.current.clear();
    };
  }, []);

  // 改数量：本地乐观更新（金额立刻跟着变），300ms 防抖后只发一次后端请求；
  // 按住步进器 1→10 也只同步最终值，不再触发 10 次请求 + 全屏 Spinner 闪烁。
  // 失败则回滚到"上次与服务端一致"的数量并提示。
  const changeQty = (id: string, q: number) => {
    setItems((s) => s.map((it) => (it.id === id ? { ...it, quantity: q } : it)));
    const pending = pendingRef.current;
    const entry = pending.get(id) ?? { timer: 0, qty: 0 };
    entry.qty = q;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = window.setTimeout(async () => {
      pending.delete(id);
      try {
        await updateCartItem(id, entry.qty);
        lastOkQtyRef.current[id] = entry.qty;
      } catch (e) {
        setItems((s) => s.map((it) => (it.id === id ? { ...it, quantity: lastOkQtyRef.current[id] ?? it.quantity } : it)));
        const err = e as AxiosError<ApiError>;
        message.error(err.response?.data?.detail || t("cart.updateFail"));
      }
    }, 300);
    pending.set(id, entry);
  };
  // 卸载时清理待执行的删除定时器，避免对已卸载组件 setState
  useEffect(() => {
    const timers = undoTimersRef.current;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
      undoTimersRef.current = {} as Record<string, number>;
      hiddenRef.current = {} as Record<string, CartItemOut>;
    };
  }, []);

  // 删除：乐观隐藏（列表立刻无该条目），5s 内可撤销恢复原位；超时后才真实调后端删除，
  // 避免误删无挽回（阶段 D UX 精致度：撤销 Snackbar）。
  const remove = (id: string) => {
    const idx = items.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const target = items[idx];
    hiddenRef.current[id] = target;
    hiddenIndexRef.current[id] = idx;
    setItems((s) => s.filter((it) => it.id !== id));
    setSelectedIds((s) => s.filter((x) => x !== id));
    if (undoTimersRef.current[id]) clearTimeout(undoTimersRef.current[id]);
    undoTimersRef.current[id] = window.setTimeout(async () => {
      try {
        await removeCartItem(id);
      } catch (e) {
        const err = e as AxiosError<ApiError>;
        message.error(err.response?.data?.detail || t("cart.deleteFail"));
        restoreHidden(id);
      } finally {
        delete undoTimersRef.current[id];
        delete hiddenRef.current[id];
        delete hiddenIndexRef.current[id];
      }
    }, 5000);
    notification.open({
      message: t("cart.undoDelete"),
      btn: (
        <Button
          size="small"
          type="link"
          onClick={() => {
            if (undoTimersRef.current[id]) clearTimeout(undoTimersRef.current[id]);
            delete undoTimersRef.current[id];
            restoreHidden(id);
          }}
        >
          {t("cart.undo")}
        </Button>
      ),
      duration: 5,
    });
  };
  // 把被乐观隐藏的条目恢复回原下标（Id 稳定，列表顺序不抖动）
  const restoreHidden = (id: string) => {
    const item = hiddenRef.current[id];
    const at = hiddenIndexRef.current[id];
    delete hiddenRef.current[id];
    delete hiddenIndexRef.current[id];
    if (!item) return;
    setItems((s) => {
      const n = [...s];
      const idx = Math.min(at ?? n.length, n.length);
      n.splice(idx, 0, item);
      return n;
    });
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
      // P1-4 直播下单闭环：若来自直播间加购，归因到对应直播间
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
      message.error(getErrorMessage(e) || t("cart.orderFail"));
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
    // 修 Bug：凑单提示只应针对「满减券」(full_reduce)，折扣券无门槛无需凑单
    const cands = coupons
      .filter(couponApplicable)
      .filter((c) => c.type === "full_reduce" && c.threshold && subtotal < Number(c.threshold));
    if (cands.length === 0) return null;
    return Math.min(...cands.map((c) => (Number(c.threshold) || 0) - subtotal));
  })();

  // 主凑单提示：优先后端算价——满减券进度，其次本地满减券门槛，再其次满减活动进度
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
    } catch (e) {
      message.error(getErrorMessage(e));
    } finally {
      setBundleLoading(false);
    }
  };
  const addBundle = async (p: BundleSuggestion) => {
    try {
      await addCartItem({ product_id: p.id, quantity: 1 });
      message.success(t("cart.added"));
      await load();
    } catch (e) {
      message.error(getErrorMessage(e));
    }
  };
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
  // 加载失败必须与"购物车是空的"区分开
  if (loadError)
    return (
      <Result
        status="warning"
        title={t("state.errorTitle")}
        subTitle={loadError}
        extra={
          <Button type="primary" icon={<ReloadOutlined />} onClick={load}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  if (items.length === 0)
    return (
      <Empty description={t("cart.empty")} className="py-20">
        <Button type="primary" onClick={() => navigate("/market")}>
          {t("favorites.browse")}
        </Button>
      </Empty>
    );

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
                <Button type="link" danger onClick={() => remove(r.id)}>
                  {t("common.delete")}
                </Button>
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
                          ? `${t("coupon.scope.shop")}:${c.applicable_category}`
                          : t("coupon.scope.platform");
                    const expire = c.expire_at
                      ? new Date(c.expire_at).toLocaleDateString()
                      : "";
                    const sub = [benefit, scope, expire ? `${t("coupon.expireAt")}:${expire}` : ""]
                      .filter(Boolean)
                      .join(" · ");
                    return {
                      value: c.id,
                      label: chk.ok
                        ? `${c.name}（${sub}）`
                        : `${c.name}（${sub} · ${chk.reason}）`,
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
              <div className="text-xs text-orange-500 mt-1">
                🎯 {t("cart.assembleHint").replace("{n}", money(assembleGap))}
              </div>
            )}
            {/* P1-2 凑单进度：后端算价的满减券/满减活动进度 + 一键去凑单 */}
            {bundleGap != null && (
              <div className="mt-2 rounded-lg bg-orange-50 border border-orange-100 px-3 py-2">
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
                      <span>
                        {p.reached
                          ? `已享减${money(p.value)}`
                          : `还差${money(p.gap)}`}
                      </span>
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
          {/* 金额构成逐项列出：用户付款前能自己算清每一分钱从哪来 */}
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">{t("cart.itemsSubtotal")}</span>
              <span className="text-slate-700">¥{money(subtotal)}</span>
            </div>
            {cDisc > 0 && selCoupon && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">
                  {t("cart.couponDiscount")}（{selCoupon.name}）
                </span>
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

      {/* P1-2 凑单抽屉：基于差额推荐可一键加购的商品 */}
      <Drawer
        title={t("cart.bundleDrawerTitle")}
        placement="right"
        width={360}
        open={bundleOpen}
        onClose={() => setBundleOpen(false)}
      >
        {bundleLoading ? (
          <Spin />
        ) : bundleList.length === 0 ? (
          <Empty description={t("cart.bundleEmpty")} />
        ) : (
          <div className="space-y-3">
            {bundleList.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-slate-100 p-2"
              >
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
                <Button size="small" type="primary" icon={<GiftOutlined />} onClick={() => addBundle(p)}>
                  {t("cart.add")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
