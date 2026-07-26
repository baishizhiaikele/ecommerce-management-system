import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Spin, Tag, Popconfirm, message } from "antd";
import { HeartFilled, ShoppingCartOutlined } from "@ant-design/icons";
import EmptyState from "../components/EmptyState";
import { listFavorites, removeFavorite, addCartItem, ProductOut } from "../api";
import { useCart } from "../store/cart";
import { money } from "../utils/format";

export default function Favorites() {
  const navigate = useNavigate();
  const add = useCart((s) => s.add);
  const [items, setItems] = useState<ProductOut[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listFavorites());
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const onRemove = async (id: string) => {
    try {
      await removeFavorite(id);
      setItems((s) => s.filter((p) => p.id !== id));
      message.success("已取消收藏");
    } catch (e: any) {
      message.error(e.response?.data?.detail || "操作失败");
    }
  };

  const onAdd = async (p: ProductOut) => {
    try {
      await addCartItem({ product_id: p.id, quantity: 1 });
      add({
        product_id: p.id,
        name: p.name,
        price: Number(p.price),
        quantity: 1,
        image_url: p.image_url || undefined,
      });
      message.success("已加入购物车");
    } catch (e: any) {
      message.error(e.response?.data?.detail || "操作失败");
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <HeartFilled style={{ color: "#EF4444" }} />
        <h2 className="text-xl font-bold m-0">我的收藏</h2>
        <span className="text-slate-400">共 {items.length} 件</span>
      </div>
      {loading ? (
        <div className="flex justify-center py-20">
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="还没有收藏任何商品"
          description="遇到喜欢的商品，点击收藏即可在这里找到"
          action={<Button type="primary" onClick={() => navigate("/")}>去逛逛</Button>}
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((p) => (
            <Card
              key={p.id}
              hoverable
              className="rounded-2xl overflow-hidden product-card group"
              cover={
                <img
                  alt={p.name}
                  src={p.image_url || ""}
                  className="h-40 w-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105"
                  onClick={() => navigate(`/products/${p.id}`)}
                />
              }
              actions={[
                <ShoppingCartOutlined key="add" onClick={() => onAdd(p)} />,
                <Popconfirm
                  key="del"
                  title="取消收藏？"
                  onConfirm={() => onRemove(p.id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <HeartFilled style={{ color: "#EF4444" }} />
                </Popconfirm>,
              ]}
            >
              <Card.Meta
                title={
                  <div className="truncate" title={p.name}>
                    {p.name}
                  </div>
                }
                description={
                  <div className="flex items-center justify-between">
                    <span className="text-[#6366F1] font-semibold">{money(p.price)}</span>
                    <Tag color={p.stock > 0 ? "green" : "red"}>
                      {p.stock > 0 ? "有货" : "缺货"}
                    </Tag>
                  </div>
                }
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
