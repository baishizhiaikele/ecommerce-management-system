import { Package } from "lucide-react";

interface Props {
  name: string;
  image_url?: string | null;
  height?: number | string;
  rounded?: number;
  className?: string;
}

/**
 * 商品图片：有图用图，无图用简约浅灰占位（中性、克制）。
 */
export default function ProductImage({
  name,
  image_url,
  height = 180,
  rounded = 12,
  className,
}: Props) {
  const usable =
    image_url && !image_url.includes("placeholder") && image_url.startsWith("http");
  if (usable) {
    return (
      <div className={className} style={{ height, borderRadius: rounded, overflow: "hidden" }}>
        <img
          src={image_url}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }
  return (
    <div
      className={className}
      style={{
        height,
        borderRadius: rounded,
        background: "#F3F4F6",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Package size={42} color="#C7CBD3" strokeWidth={1.5} />
      {name && (
        <span
          style={{
            position: "absolute",
            bottom: 10,
            left: 14,
            color: "#9CA3AF",
            fontSize: 12,
            fontWeight: 500,
            maxWidth: "80%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
      )}
    </div>
  );
}
