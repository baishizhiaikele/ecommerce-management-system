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
import {
  CategoryOut,
  FloorOut,
  HomeArrangeOut,
  ProductOut,
  PromotionOut,
  ShopSummary,
  getPromotions,
  homeArrange,
  listCategories,
  listCoupons,
  listProducts,
  listShops,
  recommendations,
  agentChat,
} from "../api";

const { Title, Paragraph, Text } = Typography;

const SEGMENTS = ["buyer", "new", "returning", "member"] as const;
const HOUR_PRESETS = [
  { label: "06:00 清晨", value: 7 },
  { label: "12:00 午间", value: 12 },
  { label: "15:00 午后", value: 15 },
  { label: "20:00 晚间", value: 20 },
  { label: "23:30 深夜", value: 23 },
];

const imgOf = (img: string | string[] | null | undefined) =>
  Array.isArray(img) ? img[0] : img || "";

function ProductCard({ p }: { p: ProductOut }) {
  const nav = useNavigate();
  return (
    <Card
      hoverable
      size="small"
      onClick={() => nav(`/product/${p.id}`)}
      cover={
        <div style={{ height: 120, background: "#f5f5f5", overflow: "hidden" }}>
          {imgOf(p.image_url) && (
            <img
              src={imgOf(p.image_url)}
              alt={p.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
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
              ¥{p.price}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              售{p.sales_count}
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
      onClick={() => p.product_id && nav(`/product/${p.product_id}`)}
      cover={
        <div style={{ height: 120, background: "#f5f5f5", overflow: "hidden" }}>
          {p.product_image && (
            <img
              src={p.product_image}
              alt={p.product_name || ""}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
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
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductOut[]>([]);
  const [promos, setPromos] = useState<PromotionOut[]>([]);
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [cats, setCats] = useState<CategoryOut[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const nav = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
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
          const res = (await listProducts({ sort: "sales", page_size: 4 })) as any;
          setProducts(res?.items ?? []);
          break;
        }
        case "top_rating": {
          const res = (await listProducts({ sort: "rating", page_size: 4 })) as any;
          setProducts(res?.items ?? []);
          break;
        }
        case "recent": {
          const res = (await listProducts({ sort: "new", page_size: 4 })) as any;
          setProducts(res?.items ?? []);
          break;
        }
        case "recommend": {
          const r = await recommendations();
          setProducts(r.slice(0, 4));
          break;
        }
        case "theme":
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
    if (!cats.length) return <Empty description="暂无分类" />;
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "4px 0" }}>
        {cats.map((c) => (
          <Tag.CheckableTag
            key={c.id}
            checked={false}
            onChange={() => nav(`/search?keyword=${encodeURIComponent(c.name)}`)}
            style={{ border: "1px solid #d9d9d9", borderRadius: 14, padding: "4px 12px" }}
          >
            {c.name}
          </Tag.CheckableTag>
        ))}
      </div>
    );
  }

  if (floor.key === "coupon") {
    if (!coupons.length) return <Empty description="暂无可用券" />;
    return (
      <Space wrap>
        {coupons.map((c: any) => (
          <Tag key={c.id} color="red" style={{ fontSize: 13, padding: "4px 10px" }}>
            {c.type === "full_reduction" ? `满${c.threshold}减${c.value}` : `立减${c.value}`}
          </Tag>
        ))}
      </Space>
    );
  }

  if (floor.key === "shops") {
    if (!shops.length) return <Empty description="暂无店铺" />;
    return (
      <Row gutter={[12, 12]}>
        {shops.map((s) => (
          <Col span={8} key={s.id}>
            <Card size="small" hoverable onClick={() => nav(`/shop/${s.id}`)}>
              <Text strong>{s.name}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {s.rating?.toFixed(1)} ★ · {s.product_count} 件
                </Text>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    );
  }

  if (floor.key === "theme") {
    return (
      <Card size="small" style={{ background: "linear-gradient(90deg,#fff1f0,#f9f0ff)" }}>
        <Text type="secondary">主题频道：为新品季 / 节日大促预留的场景化入口</Text>
      </Card>
    );
  }

  if (floor.key === "flash") {
    if (!promos.length) return <Empty description="暂无秒杀" />;
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

  if (!products.length) return <Empty description="暂无商品" />;
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
  const [segment, setSegment] = useState<string>("buyer");
  const [hour, setHour] = useState<number>(20);
  const [data, setData] = useState<HomeArrangeOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatReply, setChatReply] = useState<string>("");
  const [chatIntent, setChatIntent] = useState<string>("");
  const [chatLoading, setChatLoading] = useState(false);

  const arrange = useCallback(async () => {
    setLoading(true);
    try {
      const d = await homeArrange({ segment, hour });
      setData(d);
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "编排失败");
    } finally {
      setLoading(false);
    }
  }, [segment, hour]);

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
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "代理调用失败");
    } finally {
      setChatLoading(false);
    }
  }, [chatInput]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: 16 }}>
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
        <Text>{t("ai.home.segment")}：</Text>
        <Segmented
          value={segment}
          onChange={(v) => setSegment(v as string)}
          options={SEGMENTS.map((s) => ({
            label: t(`ai.home.seg.${s}`),
            value: s,
          }))}
        />
        <Text>{t("ai.home.hour")}：</Text>
        <Select value={hour} style={{ width: 140 }} onChange={setHour} options={HOUR_PRESETS} />
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
        {!loading && !data && <Empty description="暂无编排" />}
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
          </div>
        )}
      </Card>

      <div style={{ textAlign: "center", marginTop: 8 }}>
        <Button onClick={() => nav("/market")}>{t("market.featured")}</Button>
      </div>
    </div>
  );
}
