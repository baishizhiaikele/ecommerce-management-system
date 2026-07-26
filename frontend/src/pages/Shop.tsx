import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, Spin, Empty, Tag, Button } from "antd";
import { Star, Package, ChevronRight } from "lucide-react";
import {
  listShops,
  getShop,
  followShop,
  unfollowShop,
  followStatus,
  followersCount,
  ShopSummary,
  ShopDetail,
} from "../api";
import ProductImage from "../components/ProductImage";
import { money } from "../utils/format";

function ShopCard({ shop, onClick }: { shop: ShopSummary; onClick: () => void }) {
  return (
    <Card hoverable className="soft-card" onClick={onClick} styles={{ body: { padding: 16 } }}>
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
          {shop.avatar ? (
            <img src={shop.avatar} alt={shop.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl font-bold text-[#4F46E5]">{shop.name.slice(0, 1)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{shop.name}</div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
            <span className="flex items-center gap-0.5 text-amber-500">
              <Star size={12} fill="currentColor" />
              {shop.rating > 0 ? shop.rating.toFixed(1) : "新店"}
            </span>
            <span>·</span>
            <span>{shop.product_count} 件好物</span>
          </div>
        </div>
        <ChevronRight size={18} className="text-slate-300" />
      </div>
      {shop.description && (
        <div className="text-xs text-slate-400 mt-3 line-clamp-1">{shop.description}</div>
      )}
    </Card>
  );
}

export default function Shop() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [list, setList] = useState<ShopSummary[]>([]);
  const [detail, setDetail] = useState<ShopDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [followed, setFollowed] = useState(false);
  const [followers, setFollowers] = useState(0);

  useEffect(() => {
    if (detail) {
      followStatus(detail.id)
        .then((r) => setFollowed(r.following))
        .catch(() => {});
      followersCount(detail.id)
        .then((r) => setFollowers(r.count))
        .catch(() => {});
    }
  }, [detail]);

  const toggleFollow = async () => {
    if (!detail) return;
    try {
      if (followed) await unfollowShop(detail.id);
      else await followShop(detail.id);
      setFollowed(!followed);
      setFollowers((f) => f + (followed ? -1 : 1));
    } catch {
      /* 忽略 */
    }
  };

  useEffect(() => {
    if (id) {
      setLoading(true);
      getShop(id)
        .then(setDetail)
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      listShops()
        .then(setList)
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (id) {
    if (loading) return <div className="py-24 flex justify-center"><Spin /></div>;
    if (!detail) return <Empty description="店铺不存在" className="py-24" />;
    return (
      <div className="space-y-5">
        {/* 店铺头图 / 资料卡 */}
        <div className="relative rounded-3xl overflow-hidden">
          <div className="h-40 bg-gradient-to-r from-[#4F46E5] via-[#7C3AED] to-[#F97316]" />
          <Card className="soft-card -mt-12 mx-3 relative" styles={{ body: { padding: 20 } }}>
            <div className="flex items-end gap-4">
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white shadow-md border border-slate-100 -mt-10 shrink-0">
                {detail.avatar ? (
                  <img src={detail.avatar} alt={detail.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-[#4F46E5]">
                    {detail.name.slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="flex-1 pb-1">
                <div className="text-xl font-bold">{detail.name}</div>
                <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                  <span className="flex items-center gap-1 text-amber-500">
                    <Star size={14} fill="currentColor" />
                    {detail.rating > 0 ? detail.rating.toFixed(1) : "新店"}
                  </span>
                  <span>· {detail.product_count} 件商品</span>
                  <span>· 已售 {detail.sales_total}</span>
                </div>
                <Button
                  size="small"
                  type={followed ? "default" : "primary"}
                  className="mt-2"
                  onClick={toggleFollow}
                >
                  {followed ? "已关注" : "关注"} · {followers}
                </Button>
                {detail.description && (
                  <div className="text-xs text-slate-400 mt-2">{detail.description}</div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* 商品网格 */}
        <div className="px-1">
          <div className="flex items-center gap-2 mb-3">
            <Package size={18} className="text-[#4F46E5]" />
            <h2 className="text-lg font-bold">店铺好物</h2>
            <Tag color="purple" className="ml-auto">{detail.products.length} 件</Tag>
          </div>
          {detail.products.length === 0 ? (
            <Empty description="该店铺暂未上架商品" className="py-12" />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {detail.products.map((p) => (
                <Card
                  key={p.id}
                  hoverable
                  className="soft-card overflow-hidden"
                  onClick={() => navigate(`/product/${p.id}`)}
                  cover={
                    <div className="h-40 bg-slate-100">
                      <ProductImage src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    </div>
                  }
                >
                  <div className="font-medium text-sm line-clamp-1">{p.name}</div>
                  <div className="text-[#F97316] font-bold mt-1">{money(p.price)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">已售 {p.sales_count}</div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Star className="text-amber-500" size={22} />
        <h1 className="text-2xl font-bold">逛店铺</h1>
        <Tag color="purple" className="ml-auto">{list.length} 家好店</Tag>
      </div>
      {loading ? (
        <div className="py-20 flex justify-center"><Spin /></div>
      ) : list.length === 0 ? (
        <Empty description="暂无店铺" className="py-20" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {list.map((s) => (
            <ShopCard key={s.id} shop={s} onClick={() => navigate(`/shop/${s.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
