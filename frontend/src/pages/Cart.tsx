import { useEffect, useState } from "react";
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
import { useCart } from "../store/cart";
import { useAuth } from "../store/auth";
import { Checkbox, Divider, Select } from "antd";

function couponDiscount(c: UserCouponOut | undefined, subtotal: number): number {
  if (!c) return 0;
  if (c.type === "discount") return Number((subtotal * (1 - Number(c.value))).toFixed(2));
  if (Number(subtotal) < Number(c.threshold)) return 0;
  return Number(c.value);
}

export default function Cart() {
  const navigate = useNavigate();
  const clear = useCart((s) => s.clear);
  const points = useAuth((s) => s.user?.points ?? 0);
  const [items, setItems] = useState<CartItemOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [coupons, setCoupons] = useState<UserCouponOut[]>([]);
  const [couponId, setCouponId] = useState<string>();
  const [usePoints, setUsePoints] = useState(false);

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
    } catch (e: any) {
      message.error(e.response?.data?.detail || "更新失败");
    }
  };
  const remove = async (id: string) => {
    try {
      await removeCartItem(id);
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || "删除失败");
    }
  };
  const onCheckout = async () => {
    if (!address.trim()) {
      message.warning("请填写收货地址");
      return;
    }
    setSubmitting(true);
    try {
      const order = await checkout(address.trim(), {
        coupon_id: couponId,
        use_points: usePoints,
      });
      clear();
      message.success("下单成功");
      navigate(`/orders/${order.id}`);
    } catch (e: any) {
      message.error(e.response?.data?.detail || "下单失败");
    } finally {
      setSubmitting(false);
    }
  };

  const subtotal = items.reduce((s, it) => s + Number(it.price) * it.quantity, 0);
  const selCoupon = coupons.find((c) => c.id === couponId);
  const cDisc = couponDiscount(selCoupon, subtotal);
  const pDisc = usePoints ? Math.min(points, Math.floor(subtotal * 100)) / 100 : 0;
  const payable = Math.max(subtotal - cDisc - pDisc, 0);

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (items.length === 0) return <Empty description="购物车是空的" className="py-20" />;

  return (
    <Card title="购物车" className="rounded-2xl shadow-sm border-0">
      <Table
        dataSource={items}
        rowKey="id"
        pagination={false}
        size="middle"
        columns={[
          { title: "商品", dataIndex: "name" },
          { title: "单价", dataIndex: "price", render: (v) => `¥${money(v)}` },
          {
            title: "数量",
            render: (_, r) => (
              <InputNumber
                min={1}
                max={r.stock}
                value={r.quantity}
                onChange={(v) => v && changeQty(r.id, v)}
              />
            ),
          },
          { title: "小计", render: (_, r) => `¥${money(Number(r.price) * r.quantity)}` },
          {
            title: "操作",
            render: (_, r) => (
              <Popconfirm title="确认删除？" onConfirm={() => remove(r.id)}>
                <Button type="link" danger>
                  删除
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />

      <Divider />
      <div className="bg-[#F7F8FC] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-600">优惠券</span>
          <Select
            style={{ width: 260 }}
            placeholder="不使用优惠券"
            allowClear
            value={couponId}
            onChange={(v) => setCouponId(v)}
            options={coupons.map((c) => ({
              value: c.id,
              label: `${c.name}（${c.type === "discount" ? "折扣" : `满${c.threshold}减${c.value}`}）`,
            }))}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-600">
            使用积分抵扣
            <Tag className="ml-2" color="orange">
              可用 {points} 分（约 ¥{(points / 100).toFixed(2)}）
            </Tag>
          </span>
          <Checkbox checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)}>
            抵 {pDisc ? `¥${pDisc.toFixed(2)}` : "0 元"}
          </Checkbox>
        </div>
      </div>

      <div className="flex items-center justify-end mt-6">
        <div className="bg-[#F5F6FF] rounded-xl px-5 py-3 flex items-center gap-3 fade-up">
          <span className="text-slate-500">合计</span>
          <span className="text-[#6366F1] font-bold text-2xl">¥{money(payable)}</span>
          {cDisc + pDisc > 0 && (
            <span className="text-slate-400 text-sm line-through">已省 ¥{money(cDisc + pDisc)}</span>
          )}
        </div>
      </div>
      <div className="mt-4">
        <Input.TextArea
          rows={2}
          placeholder="收货地址（5-500 字）"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={500}
        />
        <Button type="primary" block className="mt-3" loading={submitting} onClick={onCheckout}>
          提交订单
        </Button>
      </div>
    </Card>
  );
}
