import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Button, Tag, Spin, Row, Col, message } from "antd";
import { ShopOutlined } from "@ant-design/icons";
import EmptyState from "../components/EmptyState";
import { listShops, getShop, addCartItem, ProductOut } from "../api";
import { useCart } from "../store/cart";
import { money } from "../utils/format";

export default function Shop() {
  const { id } = useParams();
  const navigate = useNavigate();
  const add = useCart((s) => s.add);
  const [shops, setShops] = useState<{ id: string; name: string; product_count: number }[]>([]);
  const [detail, setDetail] = useState<{ id: string; name: string; products: ProductOut[] } | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    if (id) {
      getShop(id)
        .then((d) => setDetail(d))
        .catch(() => message.error("店铺不存在"))
        .finally(() => setLoading(false));
    } else {
      listShops()
        .then(setShops)
        .finally(() => setLoading(false));
    }
  }, [id]);

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
      message.error(e.response?.data?.detail || "加入失败");
    }
  };

  if (loading) return <div className="text-center py-20"><Spin /></div>;

  if (id) {
    if (!detail) return <EmptyState title="店铺不存在" description="该店铺可能已关闭或链接有误" />;
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <ShopOutlined className="text-[#6366F1] text-xl" />
          <h2 className="text-xl font-bold m-0">{detail.name} 的店铺</h2>
          <Tag color="cyan">{detail.products.length} 件在售</Tag>
        </div>
        {detail.products.length === 0 ? (
          <EmptyState title="该店铺暂无在售商品" description="换个店铺逛逛吧" />
        ) : (
          <Row gutter={[16, 16]}>
            {detail.products.map((p, i) => (
              <Col key={p.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  className="product-card group fade-up"
                  style={{ animationDelay: `${i * 45}ms` }}
                  cover={
                    <div className="h-40 bg-gradient-to-br from-[#EEF0FF] to-[#E6FBFF] flex items-center justify-center text-4xl transition-transform duration-300 group-hover:scale-105">
                      🛍️
                    </div>
                  }
                  onClick={() => navigate(`/products/${p.id}`)}
                >
                  <Card.Meta
                    title={<span className="font-medium text-slate-800 truncate">{p.name}</span>}
                    description={
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[#6366F1] font-bold text-lg">
                          <span className="text-sm align-top mr-0.5">¥</span>
                          {money(p.price)}
                        </span>
                        <Button type="link" onClick={(e) => { e.stopPropagation(); onAdd(p); }}>
                          加购
                        </Button>
                      </div>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </div>
    );
  }

  return (
      <div>
      <div className="flex items-center gap-2 mb-4">
        <ShopOutlined className="text-[#6366F1] text-xl" />
        <h2 className="text-xl font-bold m-0">逛店铺</h2>
      </div>
      {shops.length === 0 ? (
        <EmptyState title="暂无店铺" description="成为第一个入驻的商家吧" />
      ) : (
        <Row gutter={[16, 16]}>
          {shops.map((s, i) => (
            <Col key={s.id} xs={24} sm={12} md={8} lg={6}>
              <Card
                hoverable
                className="soft-card group fade-up"
                style={{ animationDelay: `${i * 45}ms` }}
                onClick={() => navigate(`/shops/${s.id}`)}
              >
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-cyan-400 flex items-center justify-center text-white">
                    <ShopOutlined />
                  </div>
                  <div>
                    <div className="font-semibold">{s.name}</div>
                    <Tag color="cyan">{s.product_count} 件在售</Tag>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
