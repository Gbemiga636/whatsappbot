"use client";

import Link from "next/link";
import {
  faBolt,
  faMobileScreen,
  faBell,
  faWallet,
  faArrowUpRightFromSquare,
  faCircleArrowDown,
  faCircleArrowUp,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FaIcon } from "@/components/shared/fa-icon";
import { useAuth } from "@/lib/auth-context";
import { formatNaira } from "@/lib/utils";
import { whatsappLink } from "@/lib/constants";

const QUICK = [
  {
    label: "Airtime",
    icon: faMobileScreen,
    href: whatsappLink("I want to buy airtime"),
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    label: "Data",
    icon: faBolt,
    href: whatsappLink("I want to buy data"),
    color: "bg-sky-100 text-sky-700",
  },
  {
    label: "Bills",
    icon: faBolt,
    href: whatsappLink("I want to pay a bill"),
    color: "bg-amber-100 text-amber-700",
  },
  {
    label: "Top up",
    icon: faPlus,
    href: "/dashboard/wallet",
    color: "bg-violet-100 text-violet-700",
    internal: true,
  },
  {
    label: "Reminders",
    icon: faBell,
    href: whatsappLink("Remind me to drink water every day at 8am"),
    color: "bg-rose-100 text-rose-700",
  },
  {
    label: "Wallet",
    icon: faWallet,
    href: "/dashboard/wallet",
    color: "bg-teal-100 text-teal-700",
    internal: true,
  },
];

const activity = [
  { id: 1, title: "MTN airtime", amount: -500, time: "2h ago", in: false },
  { id: 2, title: "Wallet top-up", amount: 5000, time: "Yesterday", in: true },
  { id: 3, title: "IKEDC electricity", amount: -3500, time: "Mon", in: false },
  { id: 4, title: "Reminder set", amount: 0, time: "Mon", in: false },
];

export function Overview() {
  const { user } = useAuth();
  if (!user) return null;

  const isGuest = user.mode === "guest";

  return (
    <div className="space-y-6">
      {/* OPay-style big wallet card */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0B1F17] via-[#0F3D2E] to-[#1A9B6C] p-6 text-white shadow-2xl shadow-emerald-900/25 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-emerald-300/20 blur-2xl"
        />
        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-emerald-100/90">
                Hi {user.firstName}
              </p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200/80">
                Available balance
              </p>
              <p className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
                {isGuest ? "₦0.00" : formatNaira(user.walletBalance)}
              </p>
              <p className="mt-2 text-sm text-emerald-100/75">
                {isGuest ? "Guest · pay at checkout on WhatsApp" : "Bygate wallet · ready to spend"}
              </p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
              <FaIcon icon={faWallet} className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {!isGuest ? (
              <>
                <Link
                  href="/dashboard/wallet"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-emerald-900 shadow-lg"
                >
                  <FaIcon icon={faPlus} className="h-3.5 w-3.5" />
                  Top up
                </Link>
                <a
                  href={whatsappLink("I want to buy airtime")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur"
                >
                  Spend on WhatsApp
                  <FaIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
                </a>
              </>
            ) : (
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-emerald-900 shadow-lg"
              >
                Create account
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Quick actions — big circular tiles */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500">
          Quick actions
        </h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {QUICK.map((q) => {
            const className =
              "flex flex-col items-center gap-2 rounded-3xl border border-white bg-white p-4 shadow-sm shadow-emerald-900/5 transition hover:-translate-y-0.5 hover:shadow-md";
            const body = (
              <>
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${q.color}`}
                >
                  <FaIcon icon={q.icon} className="h-5 w-5" />
                </span>
                <span className="text-xs font-semibold text-gray-800">{q.label}</span>
              </>
            );
            return q.internal ? (
              <Link key={q.label} href={q.href} className={className}>
                {body}
              </Link>
            ) : (
              <a
                key={q.label}
                href={q.href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {body}
              </a>
            );
          })}
        </div>
      </section>

      {/* Stat cards */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "This week", value: isGuest ? "—" : "₦10,200", hint: "Spend" },
          { label: "Transactions", value: isGuest ? "0" : "18", hint: "Last 30 days" },
          { label: "Reminders", value: isGuest ? "0" : "3", hint: "Active" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-3xl border border-white bg-white p-5 shadow-sm shadow-emerald-900/5"
          >
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{s.label}</p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-gray-900">{s.value}</p>
            <p className="mt-1 text-xs text-gray-500">{s.hint}</p>
          </div>
        ))}
      </section>

      {/* Recent activity */}
      <section className="overflow-hidden rounded-3xl border border-white bg-white shadow-sm shadow-emerald-900/5">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">Recent activity</h2>
          <Link href="/dashboard/activity" className="text-sm font-semibold text-emerald-700">
            See all
          </Link>
        </div>
        <div className="divide-y divide-gray-50">
          {isGuest ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">
              Your first WhatsApp purchase will show here.
            </div>
          ) : (
            activity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-4">
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                    item.amount > 0
                      ? "bg-emerald-50 text-emerald-600"
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
                  <p className="text-xs text-gray-500">{item.time}</p>
                </div>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    item.amount > 0
                      ? "text-emerald-600"
                      : item.amount < 0
                        ? "text-gray-900"
                        : "text-gray-400"
                  }`}
                >
                  {item.amount === 0
                    ? "—"
                    : item.amount > 0
                      ? `+${formatNaira(item.amount)}`
                      : formatNaira(item.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
