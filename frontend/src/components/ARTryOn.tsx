import { useEffect, useRef, useState } from "react";
import { Button, message } from "antd";
import { CameraOutlined } from "@ant-design/icons";
import { useI18n } from "../i18n";

/**
 * 轻量 AR 试穿组件（P2 体验增强，零依赖、零密钥）：
 * - 优先调用摄像头，将商品叠加图（ar_overlay_url 或主图）半透明叠加到实时画面；
 * - 无摄像头/未授权时回退到一张样图（静态背景）上叠加，仍可拖动缩放预览；
 * - 仅前端实现，不依赖任何后端或第三方 SDK，可直接端到端体验。
 */
export default function ARTryOn({ productImage, overlayImage }: { productImage: string; overlayImage?: string | null }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  // 叠加图手势状态
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  const overlay = overlayImage || productImage;

  const stopCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCameraOn(false);
  };

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(s);
      setCameraOn(true);
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch {
      message.info(t("ar.useSample"));
      setCameraOn(false);
    }
  };

  useEffect(() => () => stopCamera(), []); // 卸载时释放摄像头

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <Button
          icon={<CameraOutlined />}
          type={cameraOn ? "default" : "primary"}
          onClick={() => (cameraOn ? stopCamera() : startCamera())}
        >
          {cameraOn ? t("ar.stopCamera") : t("ar.startCamera")}
        </Button>
        <span className="text-xs text-slate-500">{t("ar.tip")}</span>
      </div>

      <div
        className="relative w-[360px] h-[480px] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 select-none"
        style={{ touchAction: "none" }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {cameraOn ? (
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm"
            style={{
              background:
                "linear-gradient(135deg,#e2e8f0 0%,#cbd5e1 100%)",
            }}
          >
            {t("ar.sampleBg")}
          </div>
        )}

        {/* 可拖动缩放的叠加图 */}
        <img
          src={overlay}
          alt="try-on overlay"
          draggable={false}
          onPointerDown={onPointerDown}
          className="absolute cursor-move"
          style={{
            left: `calc(50% + ${pos.x}px)`,
            top: `calc(50% + ${pos.y}px)`,
            width: 200 * scale,
            transform: "translate(-50%, -50%)",
            opacity: 0.85,
            pointerEvents: "auto",
            filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.25))",
          }}
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500">{t("ar.scale")}</span>
        <input
          type="range"
          min={0.5}
          max={2.5}
          step={0.1}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="w-40"
        />
      </div>

      {!cameraOn && <span className="text-xs text-slate-400">{t("ar.noCameraHint")}</span>}
    </div>
  );
}
