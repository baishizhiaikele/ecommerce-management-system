import { useEffect, useState } from "react";
import { List, Tag, Card, Spin, Rate, Button } from "antd";
import EmptyState from "../../components/EmptyState";
import { adminNegativeReviews, ReviewOut } from "../../api";
import { sentimentMeta } from "../../utils/format";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n";

export default function AdminReviews() {
  const { t } = useI18n();
  const [items, setItems] = useState<ReviewOut[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  useEffect(() => {
    adminNegativeReviews()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="text-center py-10"><Spin /></div>;
  return (
    <Card title={t("admin.negReviewWarn")}>
      <List
        dataSource={items}
        locale={{
          emptyText: (
            <EmptyState title={t("admin.noNegReviews")} description={t("admin.noNegReviewsDesc")} />
          ),
        }}
        renderItem={(r) => (
          <List.Item
            actions={[
              <Button type="link" key="v" onClick={() => navigate(`/products/${r.product_id}`)}>
                {t("admin.viewProduct")}
              </Button>,
            ]}
          >
            <div>
              <Rate disabled value={r.rating} />
              <Tag color={sentimentMeta[r.sentiment].color} className="ml-2">
                {sentimentMeta[r.sentiment].label}
              </Tag>
              <div className="text-slate-600 mt-1">{r.content}</div>
            </div>
          </List.Item>
        )}
      />
    </Card>
  );
}
