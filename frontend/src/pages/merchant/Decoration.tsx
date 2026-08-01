import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  ColorPicker,
  Input,
  message,
  Select,
  Spin,
  Switch,
} from "antd";
import { Paintbrush, Save } from "lucide-react";
import {
  DecorationModule,
  getMyDecoration,
  myProducts,
  ProductOut,
  saveMyDecoration,
} from "../../api";
import ProductImage from "../../components/ProductImage";
import { money } from "../../utils/format";
import { useI18n } from "../../i18n";

export default function MerchantDecoration() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<ProductOut[]>([]);

  const [themeColor, setThemeColor] = useState("#1677ff");
  const [bannerImage, setBannerImage] = useState("");
  const [bannerTitle, setBannerTitle] = useState("");
  const [bannerSubtitle, setBannerSubtitle] = useState("");
  const [noticeEnabled, setNoticeEnabled] = useState(false);
  const [noticeText, setNoticeText] = useState("");
  const [recTitle, setRecTitle] = useState("");
  const [recIds, setRecIds] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([getMyDecoration(), myProducts()])
      .then(([deco, prods]) => {
        setProducts(prods);
        setThemeColor(deco.theme_color);
        setBannerImage(deco.banner_image || "");
        setBannerTitle(deco.banner_title || "");
        setBannerSubtitle(deco.banner_subtitle || "");
        const notice = deco.layout.find((m) => m.type === "notice");
        if (notice) {
          setNoticeEnabled(true);
          setNoticeText(notice.text || "");
        }
        const rec = deco.layout.find(
          (m) => m.type === "products" && (m.product_ids?.length || 0) > 0
        );
        if (rec) {
          setRecTitle(rec.title || "");
          setRecIds(rec.product_ids || []);
        }
      })
      .catch(() => message.error(t("deco.loadFail")))
      .finally(() => setLoading(false));
  }, []);

  const recProducts = useMemo(
    () => recIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as ProductOut[],
    [recIds, products]
  );

  const onSave = async () => {
    setSaving(true);
    try {
      const layout: DecorationModule[] = [{ type: "banner" }];
      if (noticeEnabled && noticeText.trim()) {
        layout.push({ type: "notice", text: noticeText.trim() });
      }
      if (recIds.length > 0) {
        layout.push({
          type: "products",
          title: recTitle.trim() || t("deco.recDefaultTitle"),
          product_ids: recIds,
        });
      }
      layout.push({ type: "products", title: t("deco.allProducts"), product_ids: [] });
      await saveMyDecoration({
        theme_color: themeColor,
        banner_image: bannerImage.trim() || null,
        banner_title: bannerTitle.trim() || null,
        banner_subtitle: bannerSubtitle.trim() || null,
        layout,
      });
      message.success(t("deco.saved"));
    } catch {
      message.error(t("deco.saveFail"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-24 flex justify-center"><Spin /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Paintbrush size={22} className="text-indigo-600" />
        <h1 className="text-2xl font-bold">{t("deco.title")}</h1>
        <Button
          type="primary"
          icon={<Save size={14} />}
          className="ml-auto"
          loading={saving}
          onClick={onSave}
        >
          {t("deco.save")}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：配置表单 */}
        <div className="space-y-5">
          <Card title={t("deco.theme")} className="soft-card">
            <div className="flex items-center gap-3">
              <ColorPicker
                value={themeColor}
                onChange={(c) => setThemeColor(c.toHexString())}
                showText
              />
              <span className="text-slate-400 text-sm">{t("deco.themeHint")}</span>
            </div>
          </Card>

          <Card title={t("deco.banner")} className="soft-card">
            <div className="space-y-3">
              <Input
                placeholder={t("deco.bannerImagePlaceholder")}
                value={bannerImage}
                onChange={(e) => setBannerImage(e.target.value)}
                maxLength={500}
              />
              <Input
                placeholder={t("deco.bannerTitlePlaceholder")}
                value={bannerTitle}
                onChange={(e) => setBannerTitle(e.target.value)}
                maxLength={100}
              />
              <Input
                placeholder={t("deco.bannerSubtitlePlaceholder")}
                value={bannerSubtitle}
                onChange={(e) => setBannerSubtitle(e.target.value)}
                maxLength={200}
              />
            </div>
          </Card>

          <Card
            title={
              <div className="flex items-center justify-between">
                <span>{t("deco.notice")}</span>
                <Switch checked={noticeEnabled} onChange={setNoticeEnabled} />
              </div>
            }
            className="soft-card"
          >
            <Input
              placeholder={t("deco.noticePlaceholder")}
              value={noticeText}
              disabled={!noticeEnabled}
              onChange={(e) => setNoticeText(e.target.value)}
              maxLength={200}
            />
          </Card>

          <Card title={t("deco.recommend")} className="soft-card">
            <div className="space-y-3">
              <Input
                placeholder={t("deco.recTitlePlaceholder")}
                value={recTitle}
                onChange={(e) => setRecTitle(e.target.value)}
                maxLength={50}
              />
              <Select
                mode="multiple"
                className="w-full"
                placeholder={t("deco.recProductsPlaceholder")}
                value={recIds}
                onChange={setRecIds}
                optionFilterProp="label"
                options={products.map((p) => ({ value: p.id, label: p.name }))}
                maxTagCount={6}
              />
            </div>
          </Card>
        </div>

        {/* 右侧：实时预览 */}
        <Card title={t("deco.preview")} className="soft-card h-fit">
          <div className="rounded-2xl overflow-hidden border border-slate-100">
            <div
              className="h-32 relative flex flex-col justify-center px-6 text-white"
              style={{
                background: bannerImage
                  ? undefined
                  : `linear-gradient(135deg, ${themeColor}, ${themeColor}99)`,
              }}
            >
              {bannerImage && (
                <img
                  src={bannerImage}
                  alt="banner"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <div className="relative z-10 drop-shadow">
                <div className="text-xl font-bold">
                  {bannerTitle || t("deco.bannerTitleDefault")}
                </div>
                {bannerSubtitle && <div className="text-sm mt-1 opacity-90">{bannerSubtitle}</div>}
              </div>
            </div>
            {noticeEnabled && noticeText.trim() && (
              <div
                className="px-4 py-2 text-sm"
                style={{ background: `${themeColor}15`, color: themeColor }}
              >
                📢 {noticeText}
              </div>
            )}
            <div className="p-4">
              {recIds.length > 0 && (
                <>
                  <div className="font-semibold mb-2" style={{ color: themeColor }}>
                    {recTitle || t("deco.recDefaultTitle")}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {recProducts.slice(0, 6).map((p) => (
                      <div key={p.id} className="rounded-xl border border-slate-100 overflow-hidden">
                        <div className="h-16 bg-slate-100">
                          <ProductImage src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="p-1.5">
                          <div className="text-xs line-clamp-1">{p.name}</div>
                          <div className="text-xs font-bold" style={{ color: themeColor }}>
                            {money(p.price)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="text-xs text-slate-400 mt-3">{t("deco.previewHint")}</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
