import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Tag, message } from "antd";
import { Package, Gift, MapPin, Heart, Bell, Ticket, Sparkles, Share2 } from "lucide-react";
import { useAuth } from "../store/auth";
import { signIn, listAddresses } from "../api";
import { useI18n } from "../i18n";

export default function Me() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const { t } = useI18n();
  const [points, setPoints] = useState(user?.points ?? 0);
  const [signed, setSigned] = useState(false);
  const [gained, setGained] = useState(0);
  const [addrCount, setAddrCount] = useState(0);

  useEffect(() => {
    listAddresses()
      .then((a) => setAddrCount(a.length))
      .catch(() => {});
  }, []);

  const doSign = async () => {
    try {
      const r = await signIn();
      setSigned(r.signed_today);
      setGained(r.gained);
      setPoints(r.points);
      if (r.signed_today) message.info(t("me.signedToday"));
      else message.success(t("me.signInSuccess").replace("{n}", String(r.gained)));
    } catch {
      message.error(t("me.signInFail"));
    }
  };

  const tiles = [
    { labelKey: "page.orders.title", icon: <Package size={20} />, go: () => navigate("/orders") },
    { labelKey: "me.tiles.points", icon: <Gift size={20} />, go: () => navigate("/points") },
    { labelKey: "page.address.title", icon: <MapPin size={20} />, badge: addrCount, go: () => navigate("/addresses") },
    { labelKey: "page.favorites.title", icon: <Heart size={20} />, go: () => navigate("/favorites") },
    { labelKey: "page.notifications.title", icon: <Bell size={20} />, go: () => navigate("/notifications") },
    { labelKey: "page.coupons.title", icon: <Ticket size={20} />, go: () => navigate("/coupons") },
    { labelKey: "page.mall.title", icon: <Sparkles size={20} />, go: () => navigate("/mall") },
  ];

  return (
    <div className="space-y-6">
      <Card className="soft-card" styles={{ body: { padding: 24 } }}>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#4F46E5] text-white flex items-center justify-center text-2xl font-bold">
            {(user?.username || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="text-xl font-bold">{user?.username}</div>
            <Tag color="purple" className="mt-1">
              {t("me.points")} {points}
            </Tag>
          </div>
          <Button type="primary" size="large" icon={<Sparkles size={16} />} onClick={doSign}>
            {signed ? t("me.signedToday") : `${t("me.signIn")}${gained ? ` +${gained}` : ""}`}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {tiles.map((tile) => (
          <Card key={tile.labelKey} hoverable className="soft-card text-center" onClick={tile.go}>
            <div className="flex justify-center mb-2 text-[#4F46E5]">{tile.icon}</div>
            <div className="font-medium">{t(tile.labelKey)}</div>
            {tile.badge ? <div className="text-xs text-slate-400 mt-0.5">{t("me.totalItems").replace("{n}", String(tile.badge))}</div> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
