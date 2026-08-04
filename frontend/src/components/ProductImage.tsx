import type { LucideIcon } from "lucide-react";
import {
  Package,
  Headphones,
  Speaker,
  Watch,
  Circle,
  Camera,
  Plug,
  Battery,
  Cable,
  Lamp,
  Coffee,
  CookingPot,
  Bed,
  Box,
  BookOpen,
  Pen,
  StickyNote,
  Scissors,
  Leaf,
  Award,
  Star,
  Magnet,
  Disc3,
  Flame,
  Droplets,
  ShoppingBag,
  KeyRound,
  Mouse,
  Keyboard,
  Gamepad2,
  Image as ImageIcon,
  Sparkles,
  Puzzle,
  Music,
  Tablet,
} from "lucide-react";
import { useState } from "react";
import { proxyImg } from "../api";
import { translate } from "../i18n";

interface Props {
  name?: string;
  image_url?: string | null;
  src?: string | null;
  alt?: string;
  height?: number | string;
  rounded?: number;
  className?: string;
}

// 关键词 -> 图标。按"更具体优先"排列。
const ICON_RULES: Array<{ keys: string[]; Icon: LucideIcon }> = [
  { keys: ["充电宝", "powerbank"], Icon: Battery },
  { keys: ["数据线", "cable"], Icon: Cable },
  { keys: ["充电头", "充电板", "扩展坞", "charger", "hub", "adapter"], Icon: Plug },
  { keys: ["耳机", "头戴", "earbuds", "headset", "headphone"], Icon: Headphones },
  { keys: ["音箱", "speaker"], Icon: Speaker },
  { keys: ["手表"], Icon: Watch },
  { keys: ["手环"], Icon: Watch },
  { keys: ["戒指", "ring"], Icon: Circle },
  { keys: ["相机", "摄像头", "三脚架", "补光灯", "camera", "webcam", "tripod"], Icon: Camera },
  { keys: ["灯", "lamp"], Icon: Lamp },
  { keys: ["咖啡", "coffee"], Icon: Coffee },
  { keys: ["煎锅", "餐具", "pan", "tableware"], Icon: CookingPot },
  { keys: ["床品", "四件套", "盖毯", "浴巾", "bedding", "blanket", "towel"], Icon: Bed },
  { keys: ["护颈枕", "枕头", "pillow"], Icon: Bed },
  { keys: ["收纳", "置物架", "压缩", "storage", "basket", "shelf", "box"], Icon: Box },
  { keys: ["模型", "model"], Icon: Box },
  { keys: ["手账", "杂志", "书", "notebook", "journal", "magazine", "book"], Icon: BookOpen },
  { keys: ["笔", "pen"], Icon: Pen },
  { keys: ["便签", "sticky", "memo"], Icon: StickyNote },
  { keys: ["戳戳绣", "羊毛毡", "embroidery", "felt"], Icon: Scissors },
  { keys: ["微景观", "绿植", "花盆", "terrarium", "planter"], Icon: Leaf },
  { keys: ["徽章", "badge"], Icon: Award },
  { keys: ["贴纸", "sticker"], Icon: Star },
  { keys: ["冰箱贴", "magnet"], Icon: Magnet },
  { keys: ["黑胶", "vinyl", "record"], Icon: Disc3 },
  { keys: ["蜡烛", "candle"], Icon: Flame },
  { keys: ["沐浴", "精油", "浴", "bath", "shower"], Icon: Droplets },
  { keys: ["帆布", "tote"], Icon: ShoppingBag },
  { keys: ["钥匙扣", "keychain"], Icon: KeyRound },
  { keys: ["鼠标垫", "mousepad"], Icon: Mouse },
  { keys: ["键盘", "keyboard"], Icon: Keyboard },
  { keys: ["手柄", "gamepad", "controller"], Icon: Gamepad2 },
  { keys: ["鼠标", "mouse"], Icon: Mouse },
  { keys: ["平板支架", "tablet", "stand", "ipad"], Icon: Tablet },
  { keys: ["装饰画", "wall art", "poster"], Icon: ImageIcon },
  { keys: ["扩香", "diffuser", "aroma"], Icon: Sparkles },
  { keys: ["拼图", "puzzle", "jigsaw"], Icon: Puzzle },
  { keys: ["尤克里里", "ukulele", "guitar"], Icon: Music },
  { keys: ["手办", "盲盒", "figure", "blind"], Icon: Package },
  { keys: ["胶带", "washi", "tape"], Icon: BookOpen },
];

function pickIcon(name: string): LucideIcon {
  const n = (name || "").toLowerCase();
  for (const { keys, Icon } of ICON_RULES) {
    if (keys.some((k) => n.includes(k.toLowerCase()))) return Icon;
  }
  return Package;
}

/** 按商品名生成稳定的渐变色。 */
function colorOf(name: string): { from: string; to: string } {
  const text = name || translate("common.product");
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  const h1 = h % 360;
  const h2 = (h1 + 35) % 360;
  return { from: `hsl(${h1} 62% 60%)`, to: `hsl(${h2} 58% 46%)` };
}

/**
 * 商品图片：
 * - 有真实图源（/api/images/product 本地 AI 生成图、/uploads 本地上传图）→ 显示真实图片；
 *   加载失败时自动回退为 lucide 语义图标 + 渐变色块。
 * - 无图 / 加载失败 → 纯前端 lucide 图标（全离线）。
 */
export default function ProductImage({
  name,
  image_url,
  src,
  alt,
  height = 180,
  rounded = 12,
  className,
}: Props) {
  const displayName = name || alt || "";
  const usableUrl = image_url || src;
  // /api/images/seed 旧格式（无真实图价值），直接走图标，不浪费网络请求
  const isSeedUrl = !!usableUrl && usableUrl.startsWith("/api/images/seed");
  const hasUrl = !!usableUrl && !isSeedUrl;
  const [imgOk, setImgOk] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  const Icon = pickIcon(displayName);
  const color = colorOf(displayName);
  const heightNum = typeof height === "number" ? height : 180;
  const iconSize = Math.max(28, Math.min(Math.round(heightNum * 0.4), 80));
  const nameFontSize = Math.max(11, Math.min(Math.round(heightNum * 0.09), 14));

  // 图标块（兜底 & seed 旧格式）
  const iconBlock = (
    <div
      className={className}
      style={{
        height,
        borderRadius: rounded,
        background: `linear-gradient(135deg, ${color.from}, ${color.to})`,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 80% at 20% 10%, rgba(255,255,255,0.18), transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <Icon
        size={iconSize}
        color="#ffffff"
        strokeWidth={1.4}
        style={{ opacity: 0.92, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))" }}
      />
      {displayName && (
        <span
          style={{
            position: "absolute",
            left: 10,
            right: 10,
            bottom: 8,
            color: "#ffffff",
            fontSize: nameFontSize,
            fontWeight: 600,
            textShadow: "0 1px 2px rgba(0,0,0,0.35)",
            textAlign: "center",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: 0.3,
          }}
        >
          {displayName}
        </span>
      )}
    </div>
  );

  // seed 旧格式 / 无 URL：纯图标，不请求网络
  if (isSeedUrl || !hasUrl) return iconBlock;

  // 有真实图源：单子树渲染，图标块作兜底底图，真实图加载成功后淡入覆盖，避免重复 DOM 与闪烁
  const finalSrc = proxyImg(usableUrl!);

  return (
    <div
      className={className}
      style={{
        height,
        borderRadius: rounded,
        overflow: "hidden",
        position: "relative",
        background: "#F3F4F6",
      }}
    >
      {/* 底层的图标兜底，加载成功时被真实图遮挡 */}
      <div style={{ position: "absolute", inset: 0 }}>{iconBlock}</div>
      {!imgErr && (
        <img
          src={finalSrc}
          alt={displayName}
          loading="lazy"
          decoding="async"
          onLoad={() => setImgOk(true)}
          onError={() => setImgErr(true)}
          className="product-img"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            position: "relative",
            transition: "opacity 200ms ease, transform 360ms ease",
            opacity: imgOk ? 1 : 0,
            willChange: "transform",
          }}
        />
      )}
    </div>
  );
}