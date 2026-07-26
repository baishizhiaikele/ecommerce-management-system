import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  duration?: number;
  /** 格式化展示，默认千分位取整 */
  format?: (n: number) => string;
  /** 是否进入视口才滚动（默认 true，体验更佳） */
  useViewport?: boolean;
}

function formatDefault(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * 数字滚动：进入视口后从 0 缓动递增到目标值，强化数据“活”的高级感。
 */
export default function CountUp({
  value,
  duration = 1100,
  format = formatDefault,
  useViewport = true,
}: Props) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setDisplay(value * eased);
        if (p < 1) requestAnimationFrame(tick);
        else setDisplay(value);
      };
      requestAnimationFrame(tick);
    };

    if (!useViewport) {
      run();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            run();
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration, useViewport]);

  return <span ref={ref}>{format(display)}</span>;
}
