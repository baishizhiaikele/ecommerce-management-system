import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n";
import {
  getNotificationSettings,
  listNotificationCategories,
  updateNotificationSettings,
} from "../api";
import { Button, Card, Checkbox, Spin, message } from "antd";

const CAT_LABELS: Record<string, { zh: string; en: string }> = {
  order: { zh: "订单动态", en: "Orders" },
  coupon: { zh: "优惠券", en: "Coupons" },
  points: { zh: "积分", en: "Points" },
  review_alert: { zh: "评价提醒", en: "Review alerts" },
  price_drop: { zh: "降价通知", en: "Price drops" },
  system: { zh: "系统通知", en: "System" },
};

export default function NotificationSettings() {
  const { t, lang } = useI18n();
  const nav = useNavigate();
  const [cats, setCats] = useState<string[]>([]);
  const [muted, setMuted] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([listNotificationCategories(), getNotificationSettings()]);
      setCats(c.categories);
      setMuted(s.muted);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = (c: string, checked: boolean) =>
    setMuted((prev) => (checked ? prev.filter((x) => x !== c) : [...prev, c]));

  const save = async () => {
    setSaving(true);
    try {
      await updateNotificationSettings(muted);
      message.success(t("notif.saved"));
    } catch {
      message.error(t("common.operationFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{t("notif.title")}</h2>
        <Button onClick={() => nav(-1)}>{t("common.back")}</Button>
      </div>
      <p className="text-sm text-slate-500 mb-4">{t("notif.desc")}</p>
      {loading ? (
        <div className="text-center py-20">
          <Spin />
        </div>
      ) : (
        <Card>
          <div className="space-y-3">
            {cats.map((c) => (
              <div key={c} className="flex items-center justify-between">
                <span>{CAT_LABELS[c]?.[lang] || c}</span>
                <span className="flex items-center gap-2">
                  {muted.includes(c) ? (
                    <span className="text-xs text-slate-400">{t("notif.muted")}</span>
                  ) : (
                    <span className="text-xs text-green-600">{t("notif.on")}</span>
                  )}
                  <Checkbox
                    checked={!muted.includes(c)}
                    onChange={(e) => toggle(c, e.target.checked)}
                  >
                    {t("notif.receive")}
                  </Checkbox>
                </span>
              </div>
            ))}
          </div>
          <Button type="primary" className="mt-4" loading={saving} onClick={save}>
            {t("common.save")}
          </Button>
        </Card>
      )}
    </div>
  );
}
