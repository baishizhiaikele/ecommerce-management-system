import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Input,
  List,
  message,
} from "antd";
import { RefreshCw, Sparkles } from "lucide-react";
import { useI18n } from "../i18n";
import ProductImage from "../components/ProductImage";
import ProductPrice from "../components/ProductPrice";
import {
  CategoryOut,
  CouponOut,
  FloorOut,
  HomeArrangeOut,
  ProductOut,
  PromotionOut,
  ShopSummary,
  ViewLogOut,
  getPromotions,
  homeArrange,
  listCategories,
  listCoupons,
  listHistory,
  listProducts,
  listShops,
  recommendations,
  agentChat,
} from "../api";

const { Title, Paragraph, Text } = Typography;

const imgOf = (img: string | string[] | null | undefined) =>
  Array.isArray(img) ? img[0] : img || "";

function ProductCard({ p }: { p: ProductOut }) {
  const nav = useNavigate();
  const { t } = useI18n();
  return (
    <Card
      hoverable
      size="small"
      onClick={() => nav(`/products/${p.id}`)}
      cover={
        <div style={{ height: 120, background: "#f5f5f5", overflow: "hidden" }}>
          <ProductImage name={p.name} image_url={imgOf(p.image_url)} height={120} rounded={0} />
        </div>
      }
    >
      <Card.Meta
        title={
          <Text ellipsis style={{ fontSize: 13 }}>
            {p.name}
          </Text>
        }
        description={
          <Space size={4}>
            <Text strong style={{ color: "#f5222d" }}>
              <ProductPrice p={p} />
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t("market.sold")}{p.sales_count}
            </Text>
          </Space>
        }
      />
    </Card>
  );
}

function PromotionCard({ p }: { p: PromotionOut }) {
  const nav = useNavigate();
  return (
    <Card
      hoverable
      size="small"
      onClick={() => p.product_id && nav(`/products/${p.product_id}`)}
      cover={
        <div style={{ height: 120, background: "#f5f5f5", overflow: "hidden" }}>
          <ProductImage name={p.product_name || ""} image_url={p.product_image || undefined} height={120} rounded={0} />
        </div>
      }
    >
      <Card.Meta
        title={
          <Text ellipsis style={{ fontSize: 13 }}>
            {p.product_name}
          </Text>
        }
        description={
          <Space size={4}>
            <Text strong style={{ color: "#f5222d" }}>
              ¥{p.discount_price}
            </Text>
            {p.original_price && (
              <Text delete type="secondary" style={{ fontSize: 12 }}>
                ¥{p.original_price}
              </Text>
            )}
          </Space>
        }
      />
    </Card>
  );
}

function FloorBody({ floor }: { floor: FloorOut }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [promos, setPromos] = useState<PromotionOut[]>([]);
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [cats, setCats] = useState<CategoryOut[]>([]);
  const [recentItems, setRecentItems] = useState<ViewLogOut[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const nav = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 优先使用后端编排下发的真实商品（D 方案 B：楼层内容由后端统一编排）
      if (floor.products && floor.products.length > 0) {
        setProducts(floor.products);
        setLoading(false);
        return;
      }
      switch (floor.key) {
        case "categories": {
          const c = await listCategories();
          setCats(c);
          break;
        }
        case "coupon": {
          const cs = await listCoupons();
          setCoupons(cs.slice(0, 6));
          break;
        }
        case "shops": {
          const s = await listShops();
          setShops(s.slice(0, 6));
          break;
        }
        case "flash": {
          const ps = await getPromotions("flash");
          setPromos(ps.slice(0, 4));
          break;
        }
        case "top_sales": {
          const res = await listProducts({ sort: "sales", page_size: 4 });
          setProducts(res ?? []);
          break;
        }
        case "top_rating": {
          const res = await listProducts({ sort: "rating", page_size: 4 });
          setProducts(res ?? []);
          break;
        }
        case "recent": {
          // 真实最近浏览：登录用户走 /me/history，未登录回退本地浏览记录
          try {
            const logs = await listHistory(8);
            setRecentItems(logs);
          } catch {
            const raw = localStorage.getItem("browse_history") || "[]";
            try {
              const arr = JSON.parse(raw) as Array<{
                product_id: string;
                name?: string;
                image_url?: string | null;
                price?: number | null;
              }>;
              setRecentItems(
                arr.slice(0, 8).map((x, i) => ({
                  id: `${x.product_id}-${i}`,
                  product_id: x.product_id,
                  product_name: x.name ?? null,
                  image_url: x.image_url ?? null,
                  price: x.price ?? null,
                  created_at: new Date().toISOString(),
                })) as ViewLogOut[],
              );
            } catch {
              setRecentItems([]);
            }
          }
          setProducts([]);
          break;
        }
        case "recommend": {
          const r = await recommendations();
          setProducts(r.slice(0, 4));
          break;
        }
        case "theme": {
          const c = await listCategories();
          setCats(c);
          setProducts([]);
          break;
        }
        default:
          setProducts([]);
      }
    } catch {
      /* 忽略楼层级错误，避免整页崩溃 */
    } finally {
      setLoading(false);
    }
  }, [floor.key]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spin style={{ margin: 16 }} />;

  if (floor.key === "categories") {
    if (!cats.length) return <Empty description={t("common.noData")} />;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 0" }}>
        {cats.map((c) => (
          <Tag.CheckableTag
            key={c.id}
            checked={false}
            onChange={() => nav(`/search?keyword=${encodeURIComponent(c.name)}`)} // 复用 /search 结果页
            style={{ border: "1px solid #d9d9d9", borderRadius: 14, padding: "4px 12px" }}
          >
            {c.name}
          </Tag.CheckableTag>
        ))}
      </div>
    );
  }

  if (floor.key === "coupon") {
    if (!coupons.length) return <Empty description={t("common.noData")} />;
    return (
      <Space wrap>
        {coupons.map((c: CouponOut) => (
          <Tag key={c.id} color="red" style={{ fontSize: 13, padding: "4px 10px" }}>
            {c.type === "full_reduce"
              ? t("coupon.full").replace("{min}", String(c.threshold)).replace("{val}", String(c.value))
              : t("aim.instantOff").replace("{x}", String(c.value))}
          </Tag>
        ))}
      </Space>
    );
  }

  if (floor.key === "shops") {
    if (!shops.length) return <Empty description={t("common.noData")} />;
    return (
      <Row gutter={[12, 12]}>
        {shops.map((s) => (
          <Col span={8} key={s.id}>
            <Card size="small" hoverable onClick={() => nav(`/shops/${s.id}`)}>
              <Text strong>{s.name}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {s.rating?.toFixed(1)} ★ · {s.product_count} {t("aim.itemsUnit")}
                </Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  if (floor.key === "recent") {
    if (!recentItems.length) return <Empty description={t("common.noData")} />;
    return (
      <Row gutter={[12, 12]}>
        {recentItems.map((h) => (
          <Col xs={12} sm={6} key={h.product_id}>
            <Card
              hoverable
              size="small"
              onClick={() => nav(`/products/${h.product_id}`)}
              cover={
                <div style={{ height: 120, background: "#f5f5f5", overflow: "hidden" }}>
                  <ProductImage name={h.product_name || ""} image_url={h.image_url || undefined} height={120} rounded={0} />
                </div>
              }
            >
              <Card.Meta
                title={
                  <Text ellipsis style={{ fontSize: 13 }}>
                    {h.product_name}
                  </Text>
                }
                description={
                  h.price != null ? (
                    <Text strong style={{ color: "#f5222d" }}>
                      ¥{h.price}
                    </Text>
                  ) : undefined
                }
              />
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  if (floor.key === "theme") {
    if (!cats.length) return <Empty description={t("common.noData")} />;
    return (
      <Row gutter={[12, 12]}>
        {cats.slice(0, 6).map((c) => (
          <Col xs={12} sm={6} md={4} key={c.id}>
            <Card
              size="small"
              hoverable
              onClick={() => nav(`/market?category=${c.id}`)}
              style={{ textAlign: "center", background: "linear-gradient(135deg,#fff1f0,#f9f0ff)" }}
            >
              <Text strong>{c.name}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t("aim.themeEnter")}
                </Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  if (floor.key === "flash") {
    if (!promos.length) return <Empty description={t("common.noData")} />;
    return (
      <Row gutter={[12, 12]}>
        {promos.map((p) => (
          <Col xs={12} sm={6} key={p.id}>
            <PromotionCard p={p} />
          </Col>
        ))}
      </Row>
    );
  }

  if (!products.length) return <Empty description={t("common.noData")} />;
  return (
    <Row gutter={[12, 12]}>
      {products.map((p) => (
        <Col xs={12} sm={6} key={p.id}>
          <ProductCard p={p} />
        </Col>
      ))}
    </Row>
  );
}

export default function AIMall() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [data, setData] = useState<HomeArrangeOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatReply, setChatReply] = useState<string>("");
  const [chatIntent, setChatIntent] = useState<string>("");
  const [chatProducts, setChatProducts] = useState<
    { id: string; name: string; price: number; image_url: string | null; category_id: string | null }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);

  // D 方案 A：身份由后端按登录用户真实推导，前端不再手动选择假身份
  const arrange = useCallback(async () => {
    setLoading(true);
    try {
      const d = await homeArrange();
      setData(d);
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    arrange();
  }, [arrange]);

  const runAgent = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatLoading(true);
    try {
      const res = await agentChat({ message: msg });
      setChatReply(res.reply);
      setChatIntent(res.intent || "");
      setChatProducts(res.products || []);
    } catch (e: any) {
      setChatProducts([]);
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    } finally {
      setChatLoading(false);
    }
  }, [chatInput]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Sparkles color="#f5222d" />
        <Title level={4} style={{ margin: 0 }}>
          {t("ai.home.title")}
        </Title>
      </div>
      <Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {t("ai.home.subtitle")}
      </Paragraph>

      <Space wrap style={{ marginBottom: 12 }}>
        <Text type="secondary">{t("ai.home.segment")}：</Text>
        <Tag color="geekblue">
          {data ? t(`ai.home.seg.${data.segment}`) : t("common.loading")}
        </Tag>
        <Button icon={<RefreshCw />} onClick={arrange} loading={loading}>
          {t("ai.home.refresh")}
        </Button>
      </Space>

      {data && (
        <Card size="small" style={{ background: "#fafafa", marginBottom: 16 }}>
          <Text strong>{t("ai.home.insight")}：</Text>
          <Text>{data.insight}</Text>
        </Card>
      )}

      <Spin spinning={loading}>
        {data?.floors.map((f) => (
          <div key={f.key} style={{ marginBottom: 20 }}>
            <Divider orientation="left" style={{ margin: "8px 0 12px" }}>
              <Space>
                <Text strong>{t(`ai.floor.${f.key}`)}</Text>
                <Tag color="blue">{t("ai.home.reason")}</Tag>
                <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>
                  {f.reason}
                </Text>
              </Space>
            </Divider>
            <FloorBody floor={f} />
          </div>
        ))}
        {!loading && !data && <Empty description={t("common.noData")} />}
      </Spin>

      {/* P3-B：AI 可行动代理层 —— 用户用自然语言触发真实工具操作 */}
      <Card
        size="small"
        style={{ marginBottom: 16, background: "linear-gradient(90deg,#f0f5ff,#f9f0ff)" }}
        title={
          <Space>
            <Sparkles color="#1677ff" />
            <span>{t("ai.agent.title")}</span>
          </Space>
        }
      >
        <Paragraph type="secondary" style={{ marginBottom: 8 }}>
          {t("ai.agent.subtitle")}
        </Paragraph>
        <Space.Compact style={{ width: "100%" }}>
          <Input
            placeholder={t("ai.agent.placeholder")}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onPressEnter={runAgent}
          />
          <Button type="primary" loading={chatLoading} onClick={runAgent}>
            {t("ai.agent.send")}
          </Button>
        </Space.Compact>
        {chatReply && (
          <div style={{ marginTop: 12 }}>
            <Space size={6} wrap>
              <Tag color="blue">{t("ai.agent.intent")}</Tag>
              <Tag>{chatIntent || "-"}</Tag>
            </Space>
            <Paragraph style={{ marginTop: 6 }}>{chatReply}</Paragraph>
            {chatProducts.length > 0 && (
              <List
                grid={{ gutter: 12, xs: 1, sm: 2, md: 2, lg: 3 }}
                dataSource={chatProducts}
                style={{ marginTop: 8 }}
                renderItem={(p) => (
                  <List.Item>
                    <Card
                      size="small"
                      hoverable
                      onClick={() => nav(`/products/${p.id}`)}
                      cover={
                        <div style={{ height: 120, overflow: "hidden" }}>
                          <ProductImage src={p.image_url} name={p.name} />
                        </div>
                      }
                    >
                      <Card.Meta
                        title={<span style={{ fontSize: 13 }}>{p.name}</span>}
                        description={<ProductPrice p={{ id: p.id, price: p.price }} />}
                      />
                    </Card>
                  </List.Item>
                )}
              />
            )}
          </div>
        )}
      </Card>

      <div style={{ textAlign: "center", marginTop: 8 }}>
        <Button onClick={() => nav("/market")}>{t("market.featured")}</Button>
      </div>
    </div>
  );
}
