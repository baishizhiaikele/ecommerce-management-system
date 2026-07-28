import { useEffect, useState } from "react";
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
  CartItemOut,
  UserCouponOut,
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

  const load = async () => {
    setLoading(true);
    try {
      const [cart, mine] = await Promise.all([getCart(), myCoupons()]);
      setItems(cart);
      setCoupons(mine.filter((c) => !c.is_used));
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const changeQty = async (id: string, q: number) => {
    try {
      await updateCartItem(id, q);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("cart.updateFail"));
    }
  };
  const remove = async (id: string) => {
    try {
      await removeCartItem(id);
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };
  const onCheckout = async () => {
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
        coupon_id: couponId,
        use_points: usePoints,
        delivery_type: deliveryType,
        pickup_store: deliveryType === "pickup" ? pickupStore.trim() : undefined,
      });
      clear();
      message.success(t("cart.orderSuccess"));
      navigate(`/orders/${order.id}`);
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("cart.orderFail"));
    } finally {
      setSubmitting(false);
    }
  };

  const subtotal = calcSubtotal(items);
  const selCoupon = coupons.find((c) => c.id === couponId);
  const cDisc = calcCouponDiscount(selCoupon, subtotal);
  const pDisc = calcPointsDiscount(points, subtotal, usePoints);
  const payable = calcPayable(subtotal, cDisc, pDisc);

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (items.length === 0) return <Empty description={t("cart.empty")} className="py-20" />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      <Card title={t("cart.title")} className="rounded-2xl shadow-sm border-0 lg:col-span-2">
        <Table
          dataSource={items}
          rowKey="id"
          pagination={false}
          size="middle"
          scroll={{ x: "max-content" }}
          columns={[
            { title: t("col.product"), dataIndex: "name" },
            {
              title: t("col.spec"),
              dataIndex: "variant_label",
              render: (v: string | null | undefined) =>
                v ? <Tag color="blue">{v}</Tag> : <span className="text-slate-400">—</span>,
            },
            { title: t("col.price"), dataIndex: "price", render: (v) => `¥${money(v)}` },
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
        <Card title={t("cart.checkoutTitle")} className="rounded-2xl shadow-sm border-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-600 whitespace-nowrap">{t("cart.coupon")}</span>
              <Select
                style={{ width: 200 }}
                placeholder={t("cart.noCoupon")}
                allowClear
                value={couponId}
                onChange={(v) => setCouponId(v)}
                options={coupons.map((c) => ({
                  value: c.id,
                  label: `${c.name}（${c.type === "discount" ? t("coupon.type.discount") : t("coupon.discountHint").replace("{threshold}", c.threshold).replace("{value}", c.value)}）`,
                }))}
              />
            </div>
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

        <Card className="rounded-2xl shadow-sm border-0">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">{t("common.total")}</span>
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
          <Input.TextArea
            rows={2}
            placeholder={
              deliveryType === "pickup"
                ? t("cart.contactPlaceholder")
                : t("cart.addressPlaceholder")
            }
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={500}
            className="mt-4"
          />
          <Button type="primary" block className="mt-3" loading={submitting} onClick={onCheckout}>
            {t("cart.submit")}
          </Button>
        </Card>
      </div>
    </div>
  );
}
