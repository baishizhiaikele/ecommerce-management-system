import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Tabs, Button, Tag, message, Empty, Spin, Tooltip } from "antd";
import { Gift, Coins, Sparkles, Ticket as TicketIcon } from "lucide-react";
import { useAuth } from "../store/auth";
import { useI18n } from "../i18n";
import { listRewards, redeemReward, myRedemptions, me, RedemptionItemOut, RedemptionRecordOut } from "../api";

function RewardCard({
  item,
  points,
  onRedeem,
  loading,
}: {
  item: RedemptionItemOut;
  points: number;
  onRedeem: (id: string) => void;
  loading: boolean;
}) {
  const { t } = useI18n();
  const canAfford = points >= item.cost_points;
  const isCoupon = item.type === "coupon";
  return (
    <Card
      hoverable
      className="soft-card card-lift overflow-hidden"
      cover={
        <div className="h-36 bg-slate-100 relative">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-300">
              <Gift size={40} />
            </div>
          )}
          <Tag
            color={isCoupon ? "red" : "gold"}
            className="absolute left-2 top-2"
          >
            {isCoupon ? t("mall.coupon") : t("mall.right")}
          </Tag>
        </div>
      }
    >
      <div className="font-semibold text-slate-800 line-clamp-1">{item.name}</div>
      <div className="text-xs text-slate-400 mt-1 h-8 line-clamp-2">{item.description}</div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-[#F97316] font-bold flex items-center gap-1">
          <Coins size={15} />
          {item.cost_points}
        </span>
        <Button
          type="primary"
          size="small"
          disabled={!canAfford || loading}
          onClick={() => onRedeem(item.id)}
        >
          {canAfford ? t("mall.redeem") : t("mall.notEnough")}
        </Button>
      </div>
    </Card>
  );
}

export default function Mall() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const points = user?.points ?? 0;
  const [items, setItems] = useState<RedemptionItemOut[]>([]);
  const [records, setRecords] = useState<RedemptionRecordOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([listRewards(), myRedemptions().catch(() => [] as RedemptionRecordOut[])])
      .then(([it, rec]) => {
        setItems(it);
        setRecords(rec);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRedeem = async (id: string) => {
    setBusyId(id);
    try {
      const rec = await redeemReward(id);
      const fresh = await me();
      setUser({ ...fresh, points: fresh.points ?? 0 });
      message.success(`${t("mall.exchangeSuccess")}：${rec.reward || rec.item_name}`);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || t("mall.exchangeFail"));
    } finally {
      setBusyId(null);
    }
  };

  const items_tab = (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Coins className="text-[#F97316]" size={18} />
        <span className="text-slate-600">
          {t("mall.pointsBalance")}：<b className="text-[#F97316]">{points}</b>
        </span>
        <Tooltip title={t("mall.earnTip")}>
          <Sparkles size={15} className="text-violet-400" />
        </Tooltip>
      </div>
      {loading ? (
        <div className="py-16 flex justify-center">
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty description={t("mall.empty")} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {items.map((it) => (
            <RewardCard
              key={it.id}
              item={it}
              points={points}
              onRedeem={handleRedeem}
              loading={busyId === it.id}
            />
          ))}
        </div>
      )}
    </div>
  );

  const mine_tab = (
    <div>
      {records.length === 0 ? (
        <Empty description={t("mall.noRecords")} className="py-12">
          <Button type="primary" onClick={() => navigate("/mall")}>
            {t("mall.browse")}
          </Button>
        </Empty>
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <Card key={r.id} className="soft-card" styles={{ body: { padding: 16 } }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center">
                  <Gift size={18} />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{r.item_name}</div>
                  <div className="text-xs text-slate-400">{r.reward}</div>
                </div>
                <div className="text-right">
                  <div className="text-[#F97316] font-bold">-{r.cost_points}</div>
                  <div className="text-xs text-slate-400">
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Gift className="text-[#F97316]" size={24} />
          {t("page.mall.title")}
        </h1>
        <Button icon={<TicketIcon size={15} />} onClick={() => navigate("/coupons")}>
          {t("mall.myCards")}
        </Button>
      </div>
      <Card className="soft-card" styles={{ body: { padding: 8 } }}>
        <Tabs
          items={[
            { key: "mall", label: t("mall.redeemGoods"), children: items_tab },
            { key: "mine", label: `${t("mall.myRedeem")}${records.length ? `（${records.length}）` : ""}`, children: mine_tab },
          ]}
        />
      </Card>
    </div>
  );
}
