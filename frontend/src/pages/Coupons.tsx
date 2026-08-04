import { useEffect, useMemo, useState } from "react";
import type { AxiosError } from "axios";
import { Button, Tabs, Tag, Spin, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import EmptyState from "../components/EmptyState";
import AsyncBoundary from "../components/AsyncBoundary";
import { listCoupons, claimCoupon, myCoupons, CouponOut, UserCouponOut, getErrorMessage } from "../api";
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
  // 用户券到期时间：领取到的券以 expire_at 为准（无则回退 end_at）
  const expire = (c as UserCouponOut).expire_at || (c as CouponOut).expire_at || (c as CouponOut).end_at || null;
  const now = dayjs();
  const expired = expire ? now.isAfter(dayjs(expire)) : false;
  const expiringSoon = expire ? !expired && now.add(7, "day").isAfter(dayjs(expire)) : false;

  return (
    <div
      className="flex rounded-2xl overflow-hidden card-soft fade-up"
      style={expired ? { opacity: 0.6 } : undefined}
    >
      <div
        className="w-32 px-2 py-4 flex flex-col items-center justify-center text-white shrink-0"
        style={{ background: expired ? "#9CA3AF" : "#4F46E5" }}
      >
        <div className="text-2xl font-bold leading-tight whitespace-nowrap">{couponLabel(c)}</div>
        <div className="text-xs opacity-90 mt-1 text-center leading-tight px-1">
          {couponDesc(c)}
        </div>
      </div>
      <div className="flex-1 min-w-0 px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate" title={c.name}>{c.name}</div>
          <Tag color="blue" className="mt-2">
            {c.type === "discount" ? translate("coupon.type.discount") : translate("coupon.type.full_reduce")}
          </Tag>
          <div className="text-xs mt-1.5 text-gray-500">
            {expire ? (
              <>
                {translate("coupon.expireAt")}：{dayjs(expire).format("YYYY-MM-DD")}
                {expired ? (
                  <Tag color="default" className="ml-1">{translate("coupon.expired")}</Tag>
                ) : expiringSoon ? (
                  <Tag color="volcano" className="ml-1">{translate("coupon.expiredSoon")}</Tag>
                ) : null}
              </>
            ) : (
              <span>{translate("coupon.permanent")}</span>
            )}
          </div>
        </div>
        <div className="shrink-0">{footer}</div>
      </div>
    </div>
  );
}

export default function Coupons() {
  const { t } = useI18n();
  const [avail, setAvail] = useState<CouponOut[]>([]);
  const [mine, setMine] = useState<UserCouponOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const [a, m] = await Promise.all([listCoupons(), myCoupons()]);
      setAvail(a);
      setMine(m);
    } catch (e) {
      setLoadError(true);
      message.error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  // 按过期时间把「我的券」拆成「有效」与「已过期」，已过期券单独归类
  const { active, expired } = useMemo(() => {
    const now = dayjs();
    const a: UserCouponOut[] = [];
    const e: UserCouponOut[] = [];
    for (const c of mine) {
      const expire = c.expire_at ?? null;
      if (expire && now.isAfter(dayjs(expire))) e.push(c);
      else a.push(c);
    }
    return { active: a, expired: e };
  }, [mine]);

  // 已领取的券（按 coupon_id）不应再出现在「可领取」列表中
  const claimedIds = useMemo(() => new Set(mine.map((c) => c.coupon_id)), [mine]);
  const claimable = useMemo(
    () => avail.filter((c) => !claimedIds.has(c.id)),
    [avail, claimedIds]
  );

  const [claiming, setClaiming] = useState<string | null>(null);
  const onClaim = async (id: string) => {
    if (claiming) return;
    setClaiming(id);
    try {
      await claimCoupon(id);
      message.success(t("coupon.claimSuccess"));
      load();
    } catch (e) {
      const err = e as AxiosError<ApiError>;
      message.error(err.response?.data?.detail || t("coupon.claimFail"));
    } finally {
      setClaiming(null);
    }
  };

  return (
    <div>
      <div className="section-title">
        <h2>{t("coupon.myTitle")}</h2>
      </div>
      <AsyncBoundary loading={loading} error={loadError ? t("common.loadFailed") : null} retry={load}>
        <Tabs
          items={[
            {
              key: "mine",
              label: `${t("coupon.myTitle")}（${active.length}）`,
              children:
                active.length === 0 ? (
                  <EmptyState title={t("coupon.empty")} description={t("coupon.emptyTip")} />
                ) : (
                  <div className="grid gap-3">
                    {active.map((c) => (
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
              key: "expired",
              label: `${t("coupon.expiredTab")}（${expired.length}）`,
              children:
                expired.length === 0 ? (
                  <EmptyState title={t("coupon.noExpired")} description={t("coupon.expiredTip")} />
                ) : (
                  <div className="grid gap-3">
                    {expired.map((c) => (
                      <CouponCard key={c.id} c={c} footer={<Tag color="default">{t("coupon.expired")}</Tag>} />
                    ))}
                  </div>
                ),
            },
            {
              key: "avail",
              label: `${t("coupon.available")}（${claimable.length}）`,
              children:
                claimable.length === 0 ? (
                  <EmptyState title={t("coupon.noAvail")} description={t("coupon.availDesc")} />
                ) : (
                  <div className="grid gap-3">
                    {claimable.map((c) => (
                      <CouponCard
                        key={c.id}
                        c={c}
                        footer={
                          <Button
                            type="primary"
                            size="small"
                            loading={claiming === c.id}
                            onClick={() => onClaim(c.id)}
                          >
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
      </AsyncBoundary>
    </div>
  );
}
