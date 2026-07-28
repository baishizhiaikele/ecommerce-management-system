import { useEffect, useState } from "react";
import type { AxiosError } from "axios";
import { Card, Button, Spin, Empty, message, Tabs, Tag } from "antd";
import { useNavigate } from "react-router-dom";
import { myFollowing, unfollowShop, followFeed, FollowShopOut, ShopEventOut } from "../api";
import { useI18n } from "../i18n";

export default function Following() {
  const { t } = useI18n();
  const [list, setList] = useState<FollowShopOut[]>([]);
  const [feed, setFeed] = useState<ShopEventOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const nav = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      setList(await myFollowing());
    } finally {
      setLoading(false);
    }
  };
  const loadFeed = async () => {
    setFeedLoading(true);
    try {
      setFeed(await followFeed());
    } finally {
      setFeedLoading(false);
    }
  };
  useEffect(() => {
    load();
    loadFeed();
  }, []);

  const unfollow = async (id: string) => {
    try {
      await unfollowShop(id);
      message.success(t("follow.unfollowed"));
      load();
      loadFeed();
    } catch (e) {
      const err = e as AxiosError<any, any>;
      message.error(err.response?.data?.detail || t("common.operationFailed"));
    }
  };

  const shopsPane = loading ? (
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
              {t("follow.visitShop")}
            </Button>,
            <Button key="un" type="link" danger onClick={() => unfollow(f.merchant_id)}>
              {t("follow.unfollow")}
            </Button>,
          ]}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-[#4F46E5]">
              {f.shop_name?.slice(0, 1)}
            </div>
            <div>
              <div className="font-semibold">{f.shop_name}</div>
              <div className="text-xs text-slate-400">
                {f.followers_count} {t("shop.followers")}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  const feedPane = feedLoading ? (
    <div className="py-20 flex justify-center">
      <Spin />
    </div>
  ) : feed.length === 0 ? (
    <Empty description={t("feed.empty")} className="py-20" />
  ) : (
    <div className="space-y-3">
      {feed.map((e) => (
        <Card
          key={e.id}
          className="soft-card cursor-pointer"
          onClick={() => e.product_id && nav(`/products/${e.product_id}`)}
        >
          <div className="flex items-center gap-3">
            {e.image_url ? (
              <img
                src={e.image_url}
                alt=""
                className="w-14 h-14 rounded-lg object-cover bg-slate-100"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-[#4F46E5]">
                {e.shop_name?.slice(0, 1)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{e.shop_name}</span>
                {e.event_type === "new_product" ? (
                  <Tag color="green">{t("feed.newProduct")}</Tag>
                ) : (
                  <Tag color="orange">{t("feed.priceDrop")}</Tag>
                )}
              </div>
              <div className="truncate text-slate-600">{e.product_name}</div>
              <div className="text-xs text-slate-400">
                {new Date(e.created_at).toLocaleString()}
              </div>
            </div>
            <div className="text-right">
              {e.event_type === "price_drop" && e.old_price != null && (
                <div className="text-xs text-slate-400 line-through">
                  ¥{Number(e.old_price).toFixed(2)}
                </div>
              )}
              {e.new_price != null && (
                <div className="text-lg font-bold text-[#EF4444]">
                  ¥{Number(e.new_price).toFixed(2)}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">{t("page.following.title")}</h1>
      <Tabs
        defaultActiveKey="feed"
        items={[
          { key: "feed", label: t("feed.title"), children: feedPane },
          { key: "shops", label: t("feed.shops"), children: shopsPane },
        ]}
      />
    </div>
  );
}
