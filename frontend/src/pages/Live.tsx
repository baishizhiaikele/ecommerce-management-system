import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Col, Empty, Row, Spin, Tag } from "antd";
import { Radio as RadioIcon, Users } from "lucide-react";
import { listLiveRooms, type LiveRoomOut } from "../api";
import { useI18n } from "../i18n";
import ProductImage from "../components/ProductImage";
import Reveal from "../components/Reveal";

export default function Live() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<LiveRoomOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listLiveRooms()
      .then(setRooms)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
          <RadioIcon className="text-rose-500" size={24} /> {t("live.title")}
        </h1>
        <p className="text-slate-400 text-sm mt-1">{t("live.desc")}</p>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <Spin />
        </div>
      ) : rooms.length === 0 ? (
        <Empty className="py-20" description={t("live.empty")} />
      ) : (
        <Row gutter={[16, 16]}>
          {rooms.map((r, i) => (
            <Col key={r.id} xs={24} sm={12} md={8} lg={6}>
              <Reveal delay={(i % 4) * 60}>
                <Card
                  hoverable
                  className="soft-card overflow-hidden"
                  onClick={() => navigate(`/live/${r.id}`)}
                >
                  <div className="relative aspect-video bg-gradient-to-br from-slate-800 to-slate-600">
                    {r.cover_url && <ProductImage src={r.cover_url} alt={r.title} />}
                    <div className="absolute top-2 left-2 flex items-center gap-1">
                      {r.status === "live" ? (
                        <Tag color="red" className="!m-0 animate-pulse">
                          ● {t("live.living")}
                        </Tag>
                      ) : (
                        <Tag className="!m-0">{t("live.scheduled")}</Tag>
                      )}
                    </div>
                    <div className="absolute bottom-2 right-2 text-white/90 text-xs flex items-center gap-1 bg-black/40 rounded-full px-2 py-0.5">
                      <Users size={12} /> {r.viewers}
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="font-semibold truncate">{r.title}</div>
                    <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                      <span>{r.merchant_name}</span>
                      <span>{t("live.productCount").replace("{n}", String(r.product_count))}</span>
                    </div>
                  </div>
                </Card>
              </Reveal>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
