"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  faCircleArrowDown,
  faCircleArrowUp,
  faClockRotateLeft,
} from "@fortawesome/free-solid-svg-icons";
import { DashboardShell } from "@/components/dashboard/shell";
import { FaIcon } from "@/components/shared/fa-icon";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { formatNaira } from "@/lib/utils";

type Row = {
  id: string;
  title: string;
  amount: number;
  status: string;
  date: string;
};

export default function ActivityPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);

  const empty = !user || user.mode === "guest";

  useEffect(() => {
    if (empty) {
      setLoading(false);
      return;
    }
    fetch("/api/activity", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setRows(d.rows || []);
          setLive(!!d.live);
        }
      })
      .finally(() => setLoading(false));
  }, [empty, user?.phone]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">History</h1>
          <p className="mt-1 text-sm text-gray-500">
            {live ? "Live from WhatsApp + web transactions" : "Your money in and out"}
          </p>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-white bg-white shadow-sm shadow-violet-900/5">
          <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-700">
              <FaIcon icon={faClockRotateLeft} className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-gray-900">Transactions</h2>
              <p className="text-xs text-gray-500">
                {loading ? "Loading…" : empty ? "Sign up to sync" : `${rows.length} items`}
              </p>
            </div>
          </div>

          {empty ? (
            <div className="px-5 py-14 text-center">
              <p className="text-sm font-bold text-gray-800">Nothing synced yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Create an account with your WhatsApp number to see purchases here.
              </p>
              <Link
                href="/signup"
                className="mt-5 inline-flex rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white"
              >
                Create account
              </Link>
            </div>
          ) : loading ? (
            <div className="px-5 py-14 text-center text-sm text-gray-500">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-14 text-center text-sm text-gray-500">
              No transactions yet. Buy airtime or top up from Services.
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {rows.map((row) => (
                <div key={row.id} className="flex items-center gap-3 px-5 py-4">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                      row.amount > 0
                        ? "bg-violet-50 text-violet-600"
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
                        row.amount > 0 ? "text-violet-600" : "text-gray-900"
                      }`}
                    >
                      {row.amount > 0 ? "+" : ""}
                      {formatNaira(row.amount)}
                    </p>
                    <Badge
                      variant={row.status === "completed" || row.status === "success" ? "success" : "warning"}
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
