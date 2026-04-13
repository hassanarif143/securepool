import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type EasingName = "easeOutExpo" | "linear";

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function ease(t: number, name: EasingName): number {
  return name === "linear" ? t : easeOutExpo(t);
}

export function useCountUp(opts: {
  from: number;
  to: number;
  duration: number; // ms
  easing?: EasingName;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  format?: (n: number) => string;
  autoStart?: boolean;
}) {
  const easing = opts.easing ?? "easeOutExpo";
  const decimals = opts.decimals ?? 2;

  const [value, setValue] = useState(opts.from);
  const raf = useRef<number | null>(null);
  const startAt = useRef<number | null>(null);
  const fromRef = useRef(opts.from);
  const toRef = useRef(opts.to);
  const durRef = useRef(Math.max(0, opts.duration));

  useEffect(() => {
    fromRef.current = opts.from;
    toRef.current = opts.to;
    durRef.current = Math.max(0, opts.duration);
    if (opts.autoStart) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.from, opts.to, opts.duration, opts.autoStart]);

  const stop = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
    startAt.current = null;
  }, []);

  const tick = useCallback(() => {
    if (startAt.current == null) return;
    const t = performance.now();
    const dt = t - startAt.current;
    const p = durRef.current <= 0 ? 1 : clamp(dt / durRef.current, 0, 1);
    const e = ease(p, easing);
    const next = fromRef.current + (toRef.current - fromRef.current) * e;
    setValue(next);
    if (p < 1) raf.current = requestAnimationFrame(tick);
    else stop();
  }, [easing, stop]);

  const start = useCallback(
    (next?: { from?: number; to?: number; duration?: number }) => {
      stop();
      if (next?.from != null) fromRef.current = next.from;
      if (next?.to != null) toRef.current = next.to;
      if (next?.duration != null) durRef.current = Math.max(0, next.duration);
      setValue(fromRef.current);
      startAt.current = performance.now();
      raf.current = requestAnimationFrame(tick);
    },
    [stop, tick],
  );

  useEffect(() => stop, [stop]);

  const formatted = useMemo(() => {
    const n = Number.isFinite(value) ? value : 0;
    const rounded = Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);
    if (opts.format) return opts.format(rounded);
    const core = rounded.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return `${opts.prefix ?? ""}${core}${opts.suffix ?? ""}`;
  }, [value, decimals, opts]);

  return { value, formatted, start, stop };
}

