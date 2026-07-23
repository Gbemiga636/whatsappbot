"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { WhatsAppCTA } from "@/components/shared/whatsapp-cta";
import { FadeIn } from "@/components/shared/motion";

export function FinalCTA() {
  return (
    <section className="pb-20 sm:pb-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn>
          <div className="relative overflow-hidden rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-700 via-violet-700 to-violet-900 px-6 py-14 text-center shadow-xl shadow-violet-900/20 sm:px-12">
            <div
              aria-hidden
              className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_20%,white,transparent_35%),radial-gradient(circle_at_80%_60%,#A78BFA,transparent_40%)]"
            />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Ready when you are
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-base text-violet-100">
                Open WhatsApp for the fastest path — or create an account to unlock wallet and the
                web dashboard.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <WhatsAppCTA size="lg" label="Chat with Bygate" />
                <Button
                  asChild
                  size="lg"
                  className="border-0 bg-white text-violet-800 hover:bg-violet-50"
                >
                  <Link href="/signup">Sign up free</Link>
                </Button>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
