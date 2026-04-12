import { useEffect, useRef, useState } from "react";

/** Smooth count toward a new numeric value (fintech-style balance tick). */
export function useAnimatedNumber(target: number, durationMs = 450): number {
  const anchor = useRef(target);
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    const start = anchor.current;
    anchor.current = target;
    if (start === target) {
      setDisplay(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const ease = (t: number) => 1 - (1 - t) ** 3;
    function tick(now: number) {
      const p = Math.min(1, (now - t0) / durationMs);
      setDisplay(start + (target - start) * ease(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}
