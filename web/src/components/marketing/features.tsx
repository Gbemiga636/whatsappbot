"use client";

import {
  Bell,
  Contact,
  Smartphone,
  Sparkles,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { FEATURES } from "@/lib/constants";
import { FadeIn, Stagger, StaggerItem } from "@/components/shared/motion";

const ICONS: Record<string, LucideIcon> = {
  Smartphone,
  Zap,
  Wallet,
  Contact,
  Bell,
  Sparkles,
};

export function Features() {
  return (
    <section id="features" className="scroll-mt-24 bg-[#FAFAFC] py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-violet-700">Features</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            One super app. Two surfaces.
          </h2>
          <p className="mt-4 text-base text-gray-500 sm:text-lg">
            Do it on WhatsApp in the moment — or open the web to check your wallet, history, and
            settings.
          </p>
        </FadeIn>

        <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = ICONS[feature.icon] || Sparkles;
            return (
              <StaggerItem key={feature.id}>
                <article className="group h-full rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-violet-200 hover:shadow-lg hover:shadow-violet-900/5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">{feature.description}</p>
                </article>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
