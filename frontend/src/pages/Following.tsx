import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { Card, Button, Spin, Empty, message } from "antd";
import { useNavigate } from "react-router-dom";
import { myFollowing, unfollowShop, FollowShopOut } from "../api";
import { useI18n } from "../i18n";

export default function Following() {
  const { t } = useI18n();
  const [list, setList] = useState<FollowShopOut[]>([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      setList(await myFollowing());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const unfollow = async (id: string) => {
    try {
      await unfollowShop(id);
      message.success(t("follow.unfollowed"));
      load();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">{t("page.following.title")}</h1>
      {loading ? (
        <div className="py-20 flex justify-center">
          <Spin />
        </div>
      ) : list.length === 0 ? (
        <Empty description={t("follow.empty")} className="py-20" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((f) => (
            <Card
              key={f.merchant_id}
              className="soft-card"
              actions={[
                <Button key="go" type="link" onClick={() => nav(`/shop/${f.merchant_id}`)}>
                  进店
                </Button>,
                <Button key="un" type="link" danger onClick={() => unfollow(f.merchant_id)}>
                  取消关注
                </Button>,
              ]}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[#4F46E5]">
                  {f.shop_name?.slice(0, 1)}
                </div>
                <div>
                  <div className="font-semibold">{f.shop_name}</div>
                  <div className="text-xs text-slate-400">{f.followers_count} {t("shop.followers")}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
