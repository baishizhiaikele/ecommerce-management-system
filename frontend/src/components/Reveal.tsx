import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";

interface Props {
  children: ReactNode;
  /** 进场延迟（ms），用于错落淡入 */
  delay?: number;
  /** 位移方向，默认从下往上 */
  y?: number;
  className?: string;
}

/**
 * 滚动揭示容器：进入视口时淡入上浮（IntersectionObserver 触发，只播一次）。
 * 用于让卡片/区块在滚动到视口时依次进场，营造高级的层次感。
 */
export default function Reveal({ children, delay = 0, y = 22, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add("is-visible");
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={{ "--reveal-y": `${y}px`, transitionDelay: `${delay}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}
