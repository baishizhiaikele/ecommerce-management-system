import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Spin, Empty, Input, message, Button, Result } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { Search, Camera } from "lucide-react";
import { listProducts, ProductOut, searchByImage } from "../api";
import { getErrorMessage } from "../api";
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
  const [loadError, setLoadError] = useState(false);
  const [kwInput, setKwInput] = useState(keyword);
  const [imgSearching, setImgSearching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<any>(null);

  useEffect(() => {
    setKwInput(keyword);
  }, [keyword]);

  // 快捷键 "/" 跳转到搜索页后自动聚焦输入框
  useEffect(() => {
    if (params.get("focus") === "1" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
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
      .catch((err) => {
        if (!cancelled) {
          setLoadError(true);
          setList([]);
          message.error(getErrorMessage(err));
        }
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

  // P1-1 图搜：上传图片按相似度召回商品
  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImgSearching(true);
    searchByImage(file)
      .then((r) => {
        setList(r);
        if (r.length === 0) message.info(t("search.imageNoMatch"));
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setImgSearching(false));
  };

  return (
    <div className="max-w-[1180px] mx-auto px-4 py-4">
      <PageHeader title={t("search.title")} subtitle={keyword ? `${t("search.for")}「${keyword}」` : undefined} />
      <div className="my-3 flex gap-2 max-w-xl">
        <Input
          ref={inputRef}
          size="large"
          allowClear
          prefix={<Search size={16} className="text-slate-400" />}
          placeholder={t("market.searchBox")}
          value={kwInput}
          onChange={(e) => setKwInput(e.target.value)}
          onPressEnter={doSearch}
        />
        <Button
          size="large"
          icon={<Camera size={18} />}
          loading={imgSearching}
          onClick={() => fileRef.current?.click()}
        >
          {t("search.imageSearch")}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
      </div>

      {loadError ? (
        <Result
          status="warning"
          title={t("common.loadFailed")}
          subTitle={keyword ? `${t("search.for")}「${keyword}」` : undefined}
          extra={
            <Button type="primary" icon={<ReloadOutlined />} onClick={() => nav(`/search?keyword=${encodeURIComponent(keyword)}`)}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : loading ? (
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
