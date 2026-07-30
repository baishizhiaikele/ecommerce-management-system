import { Tag } from "antd";
import { useI18n } from "../i18n";
import { money } from "../utils/format";
import type { ProductOut } from "../api";
import { useFlashPrice } from "../context/FlashPriceContext";

/**
 * 统一的商品价格展示：若商品正在限时秒杀，显示秒杀价并保留原价划线 + “秒杀”标签；
 * 否则展示原价。所有商品列表/卡片统一复用，保证“秒杀价处处一致”。
 */
export default function ProductPrice({
  p,
  className,
  showTag = true,
}: {
  p: ProductOut;
  className?: string;
  showTag?: boolean;
}) {
  const { t } = useI18n();
  const { price, original, isFlash } = useFlashPrice(p);
  return (
    <span className={className}>
      {isFlash && showTag && (
        <Tag color="volcano" className="mr-1 align-middle">
          {t("promo.seckill")}
        </Tag>
      )}
      <span className="text-sm align-top mr-0.5">¥</span>
      {money(price)}
      {isFlash && original > price && (
        <span className="text-xs text-slate-400 line-through ml-1">
          ¥{money(original)}
        </span>
      )}
    </span>
  );
}
