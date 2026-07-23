"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { AnnouncementBar, Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PRICING } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { FadeIn, Stagger, StaggerItem } from "@/components/shared/motion";
import { cn } from "@/lib/utils";
import { WhatsAppCTA } from "@/components/shared/whatsapp-cta";

export default function PricingPage() {
  return (
    <>
      <AnnouncementBar />
      <Navbar />
      <main className="pb-20 pt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <FadeIn className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900">Simple pricing</h1>
            <p className="mt-4 text-lg text-gray-500">
              Bygate is free to use. You only pay for airtime, data, bills, and wallet top-ups —
              with transparent provider rates.
            </p>
          </FadeIn>

          <Stagger className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
            {PRICING.map((plan) => (
              <StaggerItem key={plan.name}>
                <article
                  className={cn(
                    "relative flex h-full flex-col rounded-2xl border bg-white p-8 shadow-sm",
                    plan.highlighted
                      ? "border-violet-300 shadow-lg shadow-violet-900/10 ring-1 ring-violet-200"
                      : "border-gray-200"
                  )}
                >
                  {plan.highlighted && (
                    <span className="absolute -top-3 left-8 rounded-full bg-violet-700 px-3 py-1 text-xs font-medium text-white">
                      Recommended
                    </span>
                  )}
                  <h2 className="text-xl font-semibold text-gray-900">{plan.name}</h2>
                  <p className="mt-2 text-sm text-gray-500">{plan.description}</p>
                  <p className="mt-6">
                    <span className="text-4xl font-bold tracking-tight text-gray-900">
                      {plan.price}
                    </span>
                    <span className="ml-2 text-sm text-gray-500">{plan.period}</span>
                  </p>
                  <ul className="mt-8 flex-1 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-8 w-full" variant={plan.highlighted ? "primary" : "outline"}>
                    <Link href={plan.href}>{plan.cta}</Link>
                  </Button>
                </article>
              </StaggerItem>
            ))}
          </Stagger>

          <FadeIn className="mt-12 text-center">
            <p className="text-sm text-gray-500">Or skip the web — start chatting now.</p>
            <div className="mt-4 flex justify-center">
              <WhatsAppCTA />
            </div>
          </FadeIn>
        </div>
      </main>
      <Footer />
    </>
  );
}
