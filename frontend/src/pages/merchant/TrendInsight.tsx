import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from "antd";
import { RefreshCw, TrendingUp } from "lucide-react";
import { useI18n } from "../../i18n";
import { ProductOut, TrendInsightOut, trendInsight } from "../../api";

const { Title, Paragraph, Text } = Typography;

function ProductCard({ p }: { p: ProductOut }) {
  const nav = useNavigate();
  const img = p.image_url || "";
  return (
    <Card
      hoverable
      size="small"
      onClick={() => nav(`/product/${p.id}`)}
      cover={
        <div style={{ height: 110, background: "#f5f5f5", overflow: "hidden" }}>
          {img && (
            <img src={img} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

export default function TrendInsight() {
  const { t } = useI18n();
  // 本项目 t 仅支持单参，做轻量插值
  const tf = (key: string, vars: Record<string, string | number>) =>
    Object.entries(vars).reduce(
      (s, [k, v]) => s.replace(`{${k}}`, String(v)),
      t(key)
    );
  const [data, setData] = useState<TrendInsightOut | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await trendInsight());
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("common.operationFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp color="#f5222d" />
          <Title level={4} style={{ margin: 0 }}>
            {t("ai.trend.title")}
          </Title>
        </div>
        <Button icon={<RefreshCw />} onClick={load} loading={loading}>
          {t("ai.trend.refresh")}
        </Button>
      </div>
      <Paragraph type="secondary">{t("ai.trend.subtitle")}</Paragraph>

      <Spin spinning={loading}>
        {data && (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={t("ai.trend.insight")}
              description={data.insight}
            />

            <Card size="small" style={{ marginBottom: 16 }} title={t("ai.trend.hot")}>
              {data.hot_keywords.length ? (
                <Space wrap>
                  {data.hot_keywords.map((k) => (
                    <Tag key={k} color="gold">
                      {k}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <Empty description={t("common.noData")} />
              )}
            </Card>

            <Card size="small" style={{ marginBottom: 16 }} title={t("ai.trend.gap")}>
              {data.demand_gap.length ? (
                <List
                  size="small"
                  dataSource={data.demand_gap}
                  renderItem={(g) => (
                    <List.Item>
                      <Space wrap>
                        <Tag color="volcano">{g.keyword}</Tag>
                        <Text type="secondary">{tf("ai.trend.searchCount", { n: g.search_count })}</Text>
                        <Text type="secondary">{tf("ai.trend.matched", { n: g.matched_products })}</Text>
                        <Tag color="green">{t("ai.trend.suggested")}：{g.suggested_category}</Tag>
                      </Space>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description={t("ai.trend.empty")} />
              )}
            </Card>

            {data.suggested_categories.length > 0 && (
              <Card size="small" style={{ marginBottom: 16 }} title={t("ai.trend.suggested")}>
                <Space wrap>
                  {data.suggested_categories.map((c) => (
                    <Tag key={c.category} color="blue">
                      {c.category}（{tf("ai.trend.keywords", { kw: c.keywords.join("、") })}）
                    </Tag>
                  ))}
                </Space>
              </Card>
            )}

            <Card size="small" title={t("ai.trend.rising")}>
              {data.rising_products.length ? (
                <Row gutter={[12, 12]}>
                  {data.rising_products.map((p) => (
                    <Col xs={12} sm={6} key={p.id}>
                      <ProductCard p={p} />
                    </Col>
                  ))}
                </Row>
              ) : (
                <Empty description={t("common.noData")} />
              )}
            </Card>
          </>
        )}
        {!loading && !data && <Empty description={t("common.noData")} />}
      </Spin>
    </div>
  );
}
