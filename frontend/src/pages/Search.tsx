import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Spin, Empty, Input } from "antd";
import { Search } from "lucide-react";
import { listProducts, ProductOut } from "../api";
import { useI18n } from "../i18n";
import ProductCard from "../components/ProductCard";
import PageHeader from "../components/PageHeader";

export default function SearchPage() {
  const [params] = useSearchParams();
  const keyword = (params.get("keyword") || "").trim();
  const { t } = useI18n();
  const nav = useNavigate();
  const [list, setList] = useState<ProductOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [kwInput, setKwInput] = useState(keyword);

  useEffect(() => {
    setKwInput(keyword);
  }, [keyword]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (!keyword) {
      setList([]);
      setLoading(false);
      return;
    }
    listProducts({ keyword, page_size: 60 })
      .then((r) => {
        if (!cancelled) setList(r);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [keyword]);

  const doSearch = () => {
    const q = kwInput.trim();
    if (q) nav(`/search?keyword=${encodeURIComponent(q)}`);
  };

  return (
    <div className="max-w-[1180px] mx-auto px-4 py-4">
      <PageHeader title={t("search.title")} subtitle={keyword ? `${t("search.for")}「${keyword}」` : undefined} />
      <div className="my-3 flex gap-2 max-w-xl">
        <Input
          size="large"
          allowClear
          prefix={<Search size={16} className="text-slate-400" />}
          placeholder={t("market.searchBox")}
          value={kwInput}
          onChange={(e) => setKwInput(e.target.value)}
          onPressEnter={doSearch}
        />
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <Spin />
        </div>
      ) : list.length === 0 ? (
        <Empty description={t("search.empty")} className="py-16" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {list.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
