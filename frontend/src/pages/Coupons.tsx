import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { Card, Button, Tabs, Tag, Spin, message } from "antd";
import { GiftOutlined } from "@ant-design/icons";
import EmptyState from "../components/EmptyState";
import { listCoupons, claimCoupon, myCoupons, CouponOut, UserCouponOut } from "../api";
import { useI18n, translate } from "../i18n";

function couponLabel(c: { type: string; threshold: string; value: string }) {
  if (c.type === "discount") {
    const zhe = (parseFloat(c.value) * 10).toFixed(1);
    return `${zhe} ${translate("membership.zhe")}`;
  }
  return `${translate("coupon.minus")} ${c.value}`;
}
function couponDesc(c: { type: string; threshold: string }) {
  if (c.type === "discount") return translate("coupon.noThresholdDiscount");
  return translate("coupon.thresholdHint").replace("{threshold}", c.threshold);
}

function CouponCard({
  c,
  footer,
}: {
  c: CouponOut | UserCouponOut;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex rounded-2xl overflow-hidden card-soft fade-up">
      <div
        className="w-28 flex flex-col items-center justify-center text-white"
        style={{ background: "#4F46E5" }}
      >
        <div className="text-2xl font-bold">{couponLabel(c)}</div>
        <div className="text-xs opacity-90 mt-1">{couponDesc(c)}</div>
      </div>
      <div className="flex-1 flex items-center justify-between px-4 py-3">
        <div>
          <div className="font-semibold">{c.name}</div>
          <Tag color="blue" className="mt-1">
            {c.type === "discount" ? translate("coupon.type.discount") : translate("coupon.type.full_reduce")}
          </Tag>
        </div>
        {footer}
      </div>
    </div>
  );
}

export default function Coupons() {
  const { t } = useI18n();
  const [avail, setAvail] = useState<CouponOut[]>([]);
  const [mine, setMine] = useState<UserCouponOut[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [a, m] = await Promise.all([listCoupons(), myCoupons()]);
      setAvail(a);
      setMine(m);
    } catch {
      /* 忽略 */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const onClaim = async (id: string) => {
    try {
      await claimCoupon(id);
      message.success(t("coupon.claimSuccess"));
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("coupon.claimFail"));
    }
  };

  return (
    <div>
      <div className="section-title">
        <h2>{t("coupon.myTitle")}</h2>
      </div>
      {loading ? (
        <div className="flex justify-center py-20">
          <Spin />
        </div>
      ) : (
        <Tabs
          items={[
            {
              key: "mine",
              label: `${t("coupon.myTitle")}（${mine.length}）`,
              children:
                mine.length === 0 ? (
                  <EmptyState title={t("coupon.empty")} description={t("coupon.emptyTip")} />
                ) : (
                  <div className="grid gap-3">
                    {mine.map((c) => (
                      <CouponCard
                        key={c.id}
                        c={c}
                        footer={
                          <Tag color={c.is_used ? "default" : "green"}>
                            {c.is_used ? t("coupon.used") : t("coupon.pending")}
                          </Tag>
                        }
                      />
                    ))}
                  </div>
                ),
            },
            {
              key: "avail",
              label: `${t("coupon.available")}（${avail.length}）`,
              children:
                avail.length === 0 ? (
                  <EmptyState title={t("coupon.noAvail")} description={t("coupon.availDesc")} />
                ) : (
                  <div className="grid gap-3">
                    {avail.map((c) => (
                      <CouponCard
                        key={c.id}
                        c={c}
                        footer={
                          <Button type="primary" size="small" onClick={() => onClaim(c.id)}>
                            {t("coupon.receive")}
                          </Button>
                        }
                      />
                    ))}
                  </div>
                ),
            },
          ]}
        />
      )}
    </div>
  );
}
