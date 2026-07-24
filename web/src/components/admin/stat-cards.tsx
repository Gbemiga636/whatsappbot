"use client";

import {
  faUsers,
  faReceipt,
  faCreditCard,
  faComments,
  faBell,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { FaIcon } from "@/components/shared/fa-icon";
import { money } from "@/lib/admin/demo-data";
import type { OverviewStats } from "@/lib/admin/demo-data";

export function AdminStatCards({ stats }: { stats: OverviewStats }) {
  const cards = [
    {
      label: "Users",
      value: String(stats.usersTotal),
      hint: `${stats.usersAuth} accounts`,
      icon: faUsers,
      tone: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Transactions",
      value: String(stats.txTotal),
      hint: `${stats.txCompleted} completed`,
      icon: faReceipt,
      tone: "bg-sky-50 text-sky-700",
    },
    {
      label: "Paystack in",
      value: money(stats.paystackIn),
      hint: "Completed",
      icon: faCreditCard,
      tone: "bg-violet-50 text-violet-700",
    },
    {
      label: "OPay in",
      value: money(stats.opayIn),
      hint: "Direct checkout",
      icon: faCreditCard,
      tone: "bg-teal-50 text-teal-700",
    },
    {
      label: "Live sessions",
      value: String(stats.liveSessions),
      hint: "WhatsApp now",
      icon: faComments,
      tone: "bg-amber-50 text-amber-700",
    },
    {
      label: "Reminders",
      value: String(stats.remindersActive),
      hint: `${stats.remindersDueSoon} due soon`,
      icon: faBell,
      tone: "bg-rose-50 text-rose-700",
    },
    {
      label: "Pending",
      value: String(stats.txPending),
      hint: "Awaiting payment",
      icon: faTriangleExclamation,
      tone: "bg-orange-50 text-orange-700",
    },
    {
      label: "Failed",
      value: String(stats.txFailed),
      hint: "Needs review",
      icon: faTriangleExclamation,
      tone: "bg-red-50 text-red-700",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-3xl border border-white bg-white p-5 shadow-sm shadow-emerald-900/5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">{c.label}</p>
              <p className="mt-2 text-2xl font-extrabold tracking-tight text-gray-900 tabular-nums sm:text-3xl">
                {c.value}
              </p>
              <p className="mt-1 text-xs text-gray-500">{c.hint}</p>
            </div>
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${c.tone}`}>
              <FaIcon icon={c.icon} className="h-4 w-4" />
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
