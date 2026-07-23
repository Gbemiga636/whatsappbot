"use client";

import { STEPS } from "@/lib/constants";
import { FadeIn, Stagger, StaggerItem } from "@/components/shared/motion";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-violet-700">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            From hello to done in three steps
          </h2>
        </FadeIn>

        <Stagger className="mt-14 grid gap-6 md:grid-cols-3">
          {STEPS.map((item) => (
            <StaggerItem key={item.step}>
              <div className="relative h-full rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
                <span className="text-sm font-bold text-violet-700">{item.step}</span>
                <h3 className="mt-3 text-xl font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{item.description}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
