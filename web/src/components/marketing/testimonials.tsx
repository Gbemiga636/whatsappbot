"use client";

import { TESTIMONIALS } from "@/lib/constants";
import { FadeIn, Stagger, StaggerItem } from "@/components/shared/motion";

export function Testimonials() {
  return (
    <section className="bg-[#FAFAFC] py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-violet-700">
            Customers
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Trusted in everyday Nigeria
          </h2>
        </FadeIn>

        <Stagger className="mt-14 grid gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <StaggerItem key={t.name}>
              <blockquote className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <p className="flex-1 text-[15px] leading-relaxed text-gray-700">“{t.quote}”</p>
                <footer className="mt-6 border-t border-gray-100 pt-4">
                  <cite className="not-italic">
                    <span className="block text-sm font-semibold text-gray-900">{t.name}</span>
                    <span className="text-xs text-gray-500">{t.role}</span>
                  </cite>
                </footer>
              </blockquote>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
