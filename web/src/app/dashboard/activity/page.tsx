"use client";

import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { formatNaira } from "@/lib/utils";
import Link from "next/link";

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Activity</h1>
            <p className="mt-1 text-sm text-gray-500">Transactions and bot events</p>
          </div>
          <Button variant="outline" size="sm" disabled={empty}>
            Export CSV
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>
              {empty ? "No transactions yet" : `${ROWS.length} recent items`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {empty ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-12 text-center">
                <p className="text-sm font-medium text-gray-800">Nothing here yet</p>
                <p className="mt-1 text-sm text-gray-500">
                  Complete a purchase on WhatsApp or top up your wallet.
                </p>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/signup">Create account</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="pb-3 font-medium">Description</th>
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((row) => (
                      <tr key={row.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-3.5 font-medium text-gray-900">{row.title}</td>
                        <td className="py-3.5 text-gray-500">{row.date}</td>
                        <td className="py-3.5">
                          <Badge variant={row.status === "success" ? "success" : "warning"}>
                            {row.status}
                          </Badge>
                        </td>
                        <td
                          className={`py-3.5 text-right font-medium ${
                            row.amount > 0 ? "text-emerald-600" : "text-gray-900"
                          }`}
                        >
                          {row.amount > 0 ? "+" : ""}
                          {formatNaira(row.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
