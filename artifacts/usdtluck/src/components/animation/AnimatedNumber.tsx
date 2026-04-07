import { useEffect, useMemo, useState } from "react";

type AnimatedNumberProps = {
  value: number;
  durationMs?: number;
  decimals?: number;
  className?: string;
};

export function AnimatedNumber({ value, durationMs = 600, decimals = 2, className }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    let frame = 0;
    const from = display;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (value - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  const formatted = useMemo(() => display.toFixed(decimals), [display, decimals]);
  return <span className={className}>{formatted}</span>;
}
