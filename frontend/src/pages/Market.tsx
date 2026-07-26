import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Card, Button, Row, Col, Empty, Spin, Tag, message, Select, Switch, InputNumber } from "antd";
import { useCart } from "../store/cart";
import {
  listProducts,
  listCategories,
  recommendations,
  addCartItem,
  ProductOut,
  CategoryOut,
} from "../api";
import { money } from "../utils/format";

export default function Market() {
  const navigate = useNavigate();
  const add = useCart((s) => s.add);
  const [items, setItems] = useState<ProductOut[]>([]);
  const [cats, setCats] = useState<CategoryOut[]>([]);
  const [kw, setKw] = useState("");
  const [cat, setCat] = useState<string | undefined>();
  const [sort, setSort] = useState<string | undefined>();
  const [minPrice, setMinPrice] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [inStock, setInStock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recs, setRecs] = useState<ProductOut[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listProducts({
        keyword: kw || undefined,
        category_id: cat,
        sort,
        min_price: minPrice || undefined,
        max_price: maxPrice || undefined,
        in_stock: inStock,
      });
      setItems(data);
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    listCategories()
      .then(setCats)
      .catch(() => {});
    recommendations()
      .then(setRecs)
      .catch(() => {});
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

  const CardItem = ({ p }: { p: ProductOut }) => (
    <Card
      hoverable
      className="product-card group !w-44 shrink-0"
      cover={
        <div className="h-32 bg-gradient-to-br from-[#EEF0FF] to-[#E6FBFF] flex items-center justify-center text-3xl transition-transform duration-300 group-hover:scale-105">
          🛍️
        </div>
      }
      onClick={() => navigate(`/products/${p.id}`)}
    >
      <div className="truncate text-sm text-slate-700" title={p.name}>
        {p.name}
      </div>
      <div className="text-[#6366F1] font-bold mt-1">
        <span className="text-xs align-top mr-0.5">¥</span>
        {money(p.price)}
      </div>
    </Card>
  );

  return (
    <div>
      <div className="bg-white rounded-2xl shadow-sm p-4 mb-6 flex gap-3 flex-wrap items-center">
        <Input.Search
          placeholder="搜索商品"
          allowClear
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onSearch={load}
          style={{ maxWidth: 300 }}
        />
        <Select
          placeholder="全部分类"
          allowClear
          style={{ width: 150 }}
          value={cat}
          onChange={(v) => {
            setCat(v);
            setTimeout(load, 0);
          }}
          options={cats.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          placeholder="综合排序"
          allowClear
          style={{ width: 140 }}
          value={sort}
          onChange={(v) => {
            setSort(v);
            setTimeout(load, 0);
          }}
          options={[
            { value: "price_asc", label: "价格从低到高" },
            { value: "price_desc", label: "价格从高到低" },
            { value: "sales", label: "销量优先" },
            { value: "newest", label: "最新上架" },
          ]}
        />
        <InputNumber
          placeholder="最低价"
          min={0}
          style={{ width: 100 }}
          value={minPrice}
          onChange={(v) => setMinPrice(v)}
        />
        <InputNumber
          placeholder="最高价"
          min={0}
          style={{ width: 100 }}
          value={maxPrice}
          onChange={(v) => setMaxPrice(v)}
        />
        <span className="flex items-center gap-1 text-slate-500">
          仅看有货 <Switch size="small" checked={inStock} onChange={(v) => { setInStock(v); setTimeout(load, 0); }} />
        </span>
        <Button type="primary" onClick={load}>
          查询
        </Button>
      </div>

      {recs.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1 h-5 rounded bg-[#6366F1]" />
            <span className="text-lg font-bold">猜你喜欢</span>
            <Tag color="purple" className="ml-auto">AI 推荐</Tag>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {recs.map((p) => (
              <CardItem key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20">
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty description="暂无商品" className="py-20" />
      ) : (
        <Row gutter={[16, 16]}>
          {items.map((p, i) => (
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
                  title={
                    <span className="font-medium text-slate-800 truncate">{p.name}</span>
                  }
                  description={
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[#6366F1] font-bold text-lg">
                        <span className="text-sm align-top mr-0.5">¥</span>
                        {money(p.price)}
                      </span>
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
