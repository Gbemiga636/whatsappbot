"use client";

import Link from "next/link";
import {
  faCircleArrowDown,
  faCircleArrowUp,
  faClockRotateLeft,
  faFileExport,
} from "@fortawesome/free-solid-svg-icons";
import { DashboardShell } from "@/components/dashboard/shell";
import { FaIcon } from "@/components/shared/fa-icon";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { formatNaira } from "@/lib/utils";

const ROWS = [
  { id: "tx_1", title: "MTN airtime · Mama", amount: -500, status: "success", date: "22 Jul 2026" },
  { id: "tx_2", title: "Wallet top-up · Paystack", amount: 5000, status: "success", date: "21 Jul 2026" },
  { id: "tx_3", title: "IKEDC · Meter ****5678", amount: -3500, status: "success", date: "20 Jul 2026" },
  { id: "tx_4", title: "Glo data 2GB", amount: -1200, status: "pending", date: "19 Jul 2026" },
];

export default function ActivityPage() {
  const { user } = useAuth();
  const empty = !user || user.mode === "guest";

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
              History
            </h1>
            <p className="mt-1 text-sm text-gray-500">Your money in and out</p>
          </div>
          <button
            type="button"
            disabled={empty}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 disabled:opacity-50"
          >
            <FaIcon icon={faFileExport} className="h-3.5 w-3.5" />
            Export
          </button>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-white bg-white shadow-sm shadow-emerald-900/5">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <FaIcon icon={faClockRotateLeft} className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-gray-900">Transactions</h2>
              <p className="text-xs text-gray-500">
                {empty ? "No transactions yet" : `${ROWS.length} recent items`}
              </p>
            </div>
          </div>

          {empty ? (
            <div className="px-5 py-14 text-center">
              <p className="text-sm font-bold text-gray-800">Nothing here yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Complete a purchase on WhatsApp or top up your wallet.
              </p>
              <Link
                href="/signup"
                className="mt-5 inline-flex rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white"
              >
                Create account
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {ROWS.map((row) => (
                <div key={row.id} className="flex items-center gap-3 px-5 py-4">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                      row.amount > 0
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    <FaIcon
                      icon={row.amount > 0 ? faCircleArrowDown : faCircleArrowUp}
                      className="h-4 w-4"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{row.title}</p>
                    <p className="text-xs text-gray-500">{row.date}</p>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-extrabold tabular-nums ${
                        row.amount > 0 ? "text-emerald-600" : "text-gray-900"
                      }`}
                    >
                      {row.amount > 0 ? "+" : ""}
                      {formatNaira(row.amount)}
                    </p>
                    <Badge
                      variant={row.status === "success" ? "success" : "warning"}
                      className="mt-1"
                    >
                      {row.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
