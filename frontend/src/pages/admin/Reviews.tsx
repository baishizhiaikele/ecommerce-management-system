import { useEffect, useState } from "react";
import { List, Tag, Card, Spin, Rate, Empty, Button } from "antd";
import { adminNegativeReviews, ReviewOut } from "../../api";
import { sentimentMeta } from "../../utils/format";
import { useNavigate } from "react-router-dom";

export default function AdminReviews() {
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
    <Card title="负面评价预警">
      <List
        dataSource={items}
        locale={{ emptyText: <Empty description="暂无负面评价" /> }}
        renderItem={(r) => (
          <List.Item
            actions={[
              <Button type="link" key="v" onClick={() => navigate(`/products/${r.product_id}`)}>
                查看商品
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
