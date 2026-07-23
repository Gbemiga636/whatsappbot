"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WhatsAppCTA } from "@/components/shared/whatsapp-cta";
import { Typewriter } from "@/components/shared/typewriter";
import { BRAND } from "@/lib/constants";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(109,40,217,0.12),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4] [background-image:linear-gradient(to_right,#E5E7EB_1px,transparent_1px),linear-gradient(to_bottom,#E5E7EB_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
      />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="text-center lg:text-left"
          >
            <Badge className="mb-6 px-3 py-1">WhatsApp + Web · Nigeria</Badge>
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl md:leading-[1.08]">
              <Typewriter text={BRAND.name} className="text-violet-700" speed={110} />
              <span className="mt-3 block text-2xl font-semibold tracking-tight text-gray-600 sm:text-3xl md:text-4xl">
                Everything you need — in chat or on the web
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-gray-500 sm:text-lg lg:mx-0">
              Airtime, data, bills, wallet, reminders and AI. Use the WhatsApp bot or manage your
              wallet here. Guests welcome — Paystack at checkout.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
              <WhatsAppCTA
                size="lg"
                label="Start on WhatsApp"
                message="Hi Bygate! I want to get started."
              />
              <Button asChild variant="outline" size="lg">
                <Link href="/signup">
                  Create free account
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-500 lg:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Paystack secured
              </span>
              <Link
                href="/signup?mode=guest"
                className="font-medium text-violet-700 hover:underline"
              >
                Continue as guest
              </Link>
              <Link href="/login" className="hover:text-gray-800">
                Log in to dashboard
              </Link>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 36, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex justify-center lg:justify-end"
          >
            <Image
              src="/bygate-visual.png"
              alt="Bygate on WhatsApp — chat, pay, and get things done"
              width={1200}
              height={900}
              className="h-auto w-full max-w-lg bg-transparent object-contain lg:max-w-none"
              priority
              unoptimized
              sizes="(max-width: 1024px) 100vw, 560px"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
