import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { Card, Button, Tabs, Tag, Spin, message } from "antd";
import { GiftOutlined } from "@ant-design/icons";
import EmptyState from "../components/EmptyState";
import { listCoupons, claimCoupon, myCoupons, CouponOut, UserCouponOut } from "../api";

function couponLabel(c: { type: string; threshold: string; value: string }) {
  if (c.type === "discount") {
    const zhe = (parseFloat(c.value) * 10).toFixed(1);
    return `${zhe} 折`;
  }
  return `减 ${c.value}`;
}
function couponDesc(c: { type: string; threshold: string }) {
  if (c.type === "discount") return "无门槛折扣";
  return `满 ${c.threshold} 元可用`;
}

function CouponCard({
  c,
  footer,
}: {
  c: CouponOut | UserCouponOut;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex rounded-2xl overflow-hidden border border-slate-100 shadow-sm fade-up">
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
            {c.type === "discount" ? "折扣券" : "满减券"}
          </Tag>
        </div>
        {footer}
      </div>
    </div>
  );
}

export default function Coupons() {
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
      message.success("领取成功");
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || "领取失败");
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <GiftOutlined className="text-[#4F46E5]" />
        <h2 className="text-xl font-bold m-0">我的卡券</h2>
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
              label: `我的卡券（${mine.length}）`,
              children:
                mine.length === 0 ? (
                  <EmptyState title="还没有卡券" description="去「可领取」标签页领券吧" />
                ) : (
                  <div className="grid gap-3">
                    {mine.map((c) => (
                      <CouponCard
                        key={c.id}
                        c={c}
                        footer={
                          <Tag color={c.is_used ? "default" : "green"}>
                            {c.is_used ? "已使用" : "待使用"}
                          </Tag>
                        }
                      />
                    ))}
                  </div>
                ),
            },
            {
              key: "avail",
              label: `可领取（${avail.length}）`,
              children:
                avail.length === 0 ? (
                  <EmptyState title="暂无可领取优惠券" description="优惠活动上线后会显示在这里" />
                ) : (
                  <div className="grid gap-3">
                    {avail.map((c) => (
                      <CouponCard
                        key={c.id}
                        c={c}
                        footer={
                          <Button type="primary" size="small" onClick={() => onClaim(c.id)}>
                            立即领取
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
