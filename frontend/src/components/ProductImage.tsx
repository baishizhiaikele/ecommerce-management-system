import { Package } from "lucide-react";
import { useState } from "react";
import { proxyImg } from "../api";

interface Props {
  name?: string;
  image_url?: string | null;
  src?: string | null;
  alt?: string;
  height?: number | string;
  rounded?: number;
  className?: string;
}

/**
 * 商品图片：有图用图，无图用简约浅灰占位（中性、克制）。
 * 图片加载较慢时先显示浅灰底与图标，加载完成后淡入，避免白屏。
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
  const usable =
    usableUrl && !usableUrl.includes("placeholder") && usableUrl.startsWith("http");
  const [loaded, setLoaded] = useState(false);

  if (usable) {
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
        {!loaded && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Package size={42} color="#C7CBD3" strokeWidth={1.5} />
          </div>
        )}
        <img
          src={proxyImg(usableUrl)}
          alt={displayName}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.4s ease",
            position: "relative",
          }}
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
      {displayName && (
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
          {displayName}
        </span>
      )}
    </div>
  );
}
