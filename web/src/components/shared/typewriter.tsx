"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function Typewriter({
  text,
  className,
  speed = 90,
  delay = 200,
  cursor = true,
}: {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
  cursor?: boolean;
}) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setShown("");
    setDone(false);
    let i = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        i += 1;
        setShown(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setDone(true);
        }
      }, speed);
    }, delay);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, delay]);

  return (
    <span className={cn("inline-flex items-baseline", className)} aria-label={text}>
      <span aria-hidden>{shown}</span>
      {cursor && (
        <span
          aria-hidden
          className={cn(
            "ml-0.5 inline-block h-[0.9em] w-[3px] translate-y-[0.08em] rounded-sm bg-violet-600",
            done ? "animate-pulse opacity-40" : "animate-pulse"
          )}
        />
      )}
    </span>
  );
}
