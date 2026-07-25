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
import { getCart, updateCartItem, removeCartItem, checkout, CartItemOut } from "../api";
import { money } from "../utils/format";
import { useCart } from "../store/cart";

export default function Cart() {
  const navigate = useNavigate();
  const clear = useCart((s) => s.clear);
  const [items, setItems] = useState<CartItemOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await getCart());
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
      const order = await checkout(address.trim());
      clear();
      message.success("下单成功");
      navigate(`/orders/${order.id}`);
    } catch (e: any) {
      message.error(e.response?.data?.detail || "下单失败");
    } finally {
      setSubmitting(false);
    }
  };

  const total = items.reduce((s, it) => s + Number(it.price) * it.quantity, 0);

  if (loading) return <div className="text-center py-20"><Spin /></div>;
  if (items.length === 0) return <Empty description="购物车是空的" className="py-20" />;

  return (
    <Card title="购物车">
      <Table
        dataSource={items}
        rowKey="id"
        pagination={false}
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
      <div className="flex items-center justify-end mt-6">
        <div className="text-lg">
          合计：
          <span className="text-[#4F46E5] font-bold text-2xl">¥{money(total)}</span>
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
        <Button type="primary" className="mt-3" loading={submitting} onClick={onCheckout}>
          提交订单
        </Button>
      </div>
    </Card>
  );
}
