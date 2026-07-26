import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Tag, message } from "antd";
import { Package, Gift, MapPin, Heart, Bell, Ticket, Sparkles, Store } from "lucide-react";
import { useAuth } from "../store/auth";
import { signIn, listAddresses } from "../api";

export default function Me() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
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
      if (r.signed_today) message.info("今日已签到");
      else message.success(`签到成功，获得 ${r.gained} 积分`);
    } catch {
      message.error("签到失败");
    }
  };

  const tiles = [
    { label: "我的订单", icon: <Package size={20} />, go: () => navigate("/orders") },
    { label: "积分中心", icon: <Gift size={20} />, go: () => navigate("/points") },
    { label: "收货地址", icon: <MapPin size={20} />, badge: addrCount, go: () => navigate("/addresses") },
    { label: "我的收藏", icon: <Heart size={20} />, go: () => navigate("/favorites") },
    { label: "消息中心", icon: <Bell size={20} />, go: () => navigate("/notifications") },
    { label: "优惠券", icon: <Ticket size={20} />, go: () => navigate("/coupons") },
    { label: "积分商城", icon: <Sparkles size={20} />, go: () => navigate("/mall") },
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
              积分 {points}
            </Tag>
          </div>
          <Button type="primary" size="large" icon={<Sparkles size={16} />} onClick={doSign}>
            {signed ? "今日已签到" : `签到${gained ? ` +${gained}` : ""}`}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <Card key={t.label} hoverable className="soft-card text-center" onClick={t.go}>
            <div className="flex justify-center mb-2 text-[#4F46E5]">{t.icon}</div>
            <div className="font-medium">{t.label}</div>
            {t.badge ? <div className="text-xs text-slate-400 mt-0.5">共 {t.badge} 条</div> : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
