"use client";

import { ANIMATED_STATS, AnimatedStatValue } from "@/components/shared/animated-stat";
import { FadeIn, Stagger, StaggerItem } from "@/components/shared/motion";

export function Stats() {
  return (
    <section className="border-y border-gray-200 bg-white py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Stagger className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {ANIMATED_STATS.map((stat) => (
            <StaggerItem key={stat.label} className="text-center">
              <p className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl tabular-nums">
                <AnimatedStatValue {...stat} />
              </p>
              <p className="mt-2 text-sm text-gray-500">{stat.label}</p>
            </StaggerItem>
          ))}
        </Stagger>
        <FadeIn delay={0.2} className="mt-8 text-center text-xs text-gray-400">
          Illustrative product metrics · Live analytics wire in when your backend is connected.
        </FadeIn>
      </div>
    </section>
  );
}
