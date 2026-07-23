"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type StatConfig = {
  label: string;
  /** Final display string after animation */
  display: string;
  /** Numeric target for scrolling (optional for non-numeric) */
  target: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** If true, skip numeric tween and just flash to display */
  literal?: boolean;
};

export const ANIMATED_STATS: StatConfig[] = [
  { label: "Transactions processed", display: "2.4M+", target: 2.4, decimals: 1, suffix: "M+" },
  { label: "Avg. fulfillment time", display: "<30s", target: 30, prefix: "<", suffix: "s" },
  { label: "Networks supported", display: "4", target: 4 },
  { label: "Uptime target", display: "99.9%", target: 99.9, decimals: 1, suffix: "%" },
];

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function AnimatedStatValue({
  target,
  decimals = 0,
  prefix = "",
  suffix = "",
  display,
  className,
  duration = 1400,
}: StatConfig & { className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState("0");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    let frame: number;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Fast scramble then settle
      const eased = easeOutCubic(t);
      const current = target * eased;

      // Early phase: rapid random-ish digits for "scroll" feel
      if (t < 0.55) {
        const scramble =
          decimals > 0
            ? (Math.random() * target * (1.2 - t)).toFixed(decimals)
            : String(Math.floor(Math.random() * (target * 1.8 + 1)));
        setValue(`${prefix}${scramble}${suffix}`);
      } else {
        const formatted =
          decimals > 0 ? current.toFixed(decimals) : String(Math.round(current));
        setValue(`${prefix}${formatted}${suffix}`);
      }

      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        setValue(display);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [started, target, decimals, prefix, suffix, display, duration]);

  return (
    <span ref={ref} className={cn(className)} aria-label={display}>
      {started ? value : "0"}
    </span>
  );
}
