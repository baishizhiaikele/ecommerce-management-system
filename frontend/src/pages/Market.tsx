import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Card, Button, Row, Col, Empty, Spin, Tag, message, Select } from "antd";
import { useCart } from "../store/cart";
import { listProducts, listCategories, addCartItem, ProductOut, CategoryOut } from "../api";
import { money } from "../utils/format";

export default function Market() {
  const navigate = useNavigate();
  const add = useCart((s) => s.add);
  const [items, setItems] = useState<ProductOut[]>([]);
  const [cats, setCats] = useState<CategoryOut[]>([]);
  const [kw, setKw] = useState("");
  const [cat, setCat] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listProducts({ keyword: kw || undefined, category_id: cat });
      setItems(data);
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    listCategories().then(setCats).catch(() => {});
  }, []);

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

  return (
    <div>
      <div className="flex gap-3 mb-6 flex-wrap">
        <Input.Search
          placeholder="搜索商品"
          allowClear
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onSearch={load}
          style={{ maxWidth: 360 }}
        />
        <Select
          placeholder="全部分类"
          allowClear
          style={{ width: 180 }}
          value={cat}
          onChange={(v) => {
            setCat(v);
          }}
          options={cats.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Button type="primary" onClick={load}>
          查询
        </Button>
      </div>
      {loading ? (
        <div className="text-center py-20">
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty description="暂无商品" className="py-20" />
      ) : (
        <Row gutter={[16, 16]}>
          {items.map((p) => (
            <Col key={p.id} xs={24} sm={12} md={8} lg={6}>
              <Card
                hoverable
                cover={
                  <div className="h-40 bg-gradient-to-br from-indigo-100 to-cyan-100 flex items-center justify-center text-4xl">
                    🛍️
                  </div>
                }
                onClick={() => navigate(`/products/${p.id}`)}
              >
                <Card.Meta
                  title={p.name}
                  description={
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[#4F46E5] font-bold text-lg">¥{money(p.price)}</span>
                      <Tag color={p.stock > 0 ? "green" : "red"}>
                        {p.stock > 0 ? "有货" : "缺货"}
                      </Tag>
                    </div>
                  }
                />
                <Button
                  block
                  className="mt-3"
                  type="primary"
                  disabled={p.stock <= 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd(p);
                  }}
                >
                  加入购物车
                </Button>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
