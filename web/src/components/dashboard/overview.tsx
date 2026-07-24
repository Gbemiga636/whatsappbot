"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  faMobileScreen,
  faBolt,
  faBell,
  faWallet,
  faPlus,
  faPlug,
  faTv,
  faUsers,
  faCircleArrowDown,
  faCircleArrowUp,
  faTableCells,
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { FaIcon } from "@/components/shared/fa-icon";
import { useAuth } from "@/lib/auth-context";
import { formatNaira } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/phone";
import { BOT_SERVICES, serviceWhatsAppHref } from "@/lib/bot-services";
import { useState } from "react";

const QUICK_IDS = ["airtime", "data", "electric", "tv", "topup", "reminders"] as const;

const ICON_MAP = {
  airtime: faMobileScreen,
  data: faBolt,
  electric: faPlug,
  tv: faTv,
  topup: faPlus,
  reminders: faBell,
  contacts: faUsers,
  wallet: faWallet,
} as const;

const TONE = [
  "bg-violet-100 text-violet-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
];

export function Overview() {
  const { user, refreshWallet } = useAuth();
  const [recent, setRecent] = useState<
    { id: string; title: string; amount: number; date: string }[]
  >([]);

  useEffect(() => {
    refreshWallet();
    if (!user || user.mode === "guest") return;
    fetch("/api/activity", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.rows)) setRecent(d.rows.slice(0, 4));
      })
      .catch(() => {});
  }, [user?.phone, user?.mode, refreshWallet]);

  if (!user) return null;

  const isGuest = user.mode === "guest";
  const quick = BOT_SERVICES.filter((s) =>
    (QUICK_IDS as readonly string[]).includes(s.id)
  );

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1a0b2e] via-[#3b1d6e] to-[#7c3aed] p-6 text-white shadow-2xl shadow-violet-900/30">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-fuchsia-300/20 blur-2xl"
        />
        <div className="relative">
          <p className="text-sm font-medium text-violet-100/90">Hi {user.firstName}</p>
          {user.phone ? (
            <p className="mt-1 text-xs text-violet-200/80">{formatPhoneDisplay(user.phone)}</p>
          ) : null}
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-violet-200/80">
            Available balance
          </p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {isGuest ? "₦0.00" : formatNaira(user.walletBalance)}
          </p>
          <p className="mt-2 text-sm text-violet-100/75">
            {isGuest
              ? "Guest · pay at checkout on WhatsApp"
              : user.live
                ? "Synced with WhatsApp wallet"
                : "Bygate wallet"}
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {!isGuest ? (
              <>
                <Link
                  href="/dashboard/wallet"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-violet-900 shadow-lg"
                >
                  <FaIcon icon={faPlus} className="h-3.5 w-3.5" />
                  Top up
                </Link>
                <Link
                  href="/dashboard/services"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur"
                >
                  All services
                  <FaIcon icon={faArrowRight} className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : (
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-violet-900 shadow-lg"
              >
                Create account with phone
              </Link>
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
            Quick actions
          </h2>
          <Link
            href="/dashboard/services"
            className="inline-flex items-center gap-1 text-xs font-bold text-violet-700"
          >
            <FaIcon icon={faTableCells} className="h-3 w-3" />
            See all
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {quick.map((q, i) => (
            <a
              key={q.id}
              href={serviceWhatsAppHref(q, user.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-2 rounded-3xl border border-white bg-white p-4 shadow-sm shadow-violet-900/5 transition active:scale-[0.98]"
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full ${TONE[i % TONE.length]}`}
              >
                <FaIcon
                  icon={ICON_MAP[q.id as keyof typeof ICON_MAP] || faBolt}
                  className="h-5 w-5"
                />
              </span>
              <span className="text-center text-xs font-semibold text-gray-800">{q.label}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[28px] border border-white bg-white shadow-sm shadow-violet-900/5">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">Recent activity</h2>
          <Link href="/dashboard/activity" className="text-sm font-semibold text-violet-700">
            See all
          </Link>
        </div>
        <div className="divide-y divide-gray-50">
          {isGuest || recent.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">
              {isGuest
                ? "Create an account with your WhatsApp number to sync history."
                : "Your WhatsApp purchases will show here."}
            </div>
          ) : (
            recent.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-4">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                    item.amount > 0
                      ? "bg-violet-50 text-violet-600"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  <FaIcon
                    icon={item.amount > 0 ? faCircleArrowDown : faCircleArrowUp}
                    className="h-4 w-4"
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.date}</p>
                </div>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    item.amount > 0 ? "text-violet-600" : "text-gray-900"
                  }`}
                >
                  {item.amount > 0 ? "+" : ""}
                  {formatNaira(item.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
