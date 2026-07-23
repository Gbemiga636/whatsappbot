import { fetchTransactions } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import { DataTable, LiveBadge } from "@/components/admin/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Transactions · Admin" };

export default async function AdminTransactionsPage() {
  const { rows, live } = await fetchTransactions(250);
  const completed = rows.filter((r) => r.status === "completed").length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Transactions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every airtime, bill, top-up, and guest checkout — WhatsApp & web.
          </p>
        </div>
        <LiveBadge live={live} />
      </div>

      <div className="flex flex-wrap gap-2 text-sm text-gray-600">
        <Badge variant="outline">{rows.length} loaded</Badge>
        <Badge variant="success">{completed} completed</Badge>
        <Badge variant="warning">{pending} pending</Badge>
        <Badge className="border-red-200 bg-red-50 text-red-700">{failed} failed</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
          <CardDescription>Newest first</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "when", label: "When" },
              { key: "phone", label: "Phone" },
              { key: "service", label: "Service" },
              { key: "type", label: "Type" },
              { key: "provider", label: "Provider" },
              { key: "status", label: "Status" },
              { key: "amount", label: "Amount", className: "text-right" },
              { key: "ref", label: "Reference" },
            ]}
            rows={rows.map((t) => ({
              when: new Date(t.createdAt).toLocaleString("en-NG"),
              phone: t.phone,
              service: t.service,
              type: t.type,
              provider: t.provider || "—",
              status: (
                <Badge
                  variant={
                    t.status === "completed"
                      ? "success"
                      : t.status === "pending"
                        ? "warning"
                        : "outline"
                  }
                  className={
                    t.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : undefined
                  }
                >
                  {t.status}
                </Badge>
              ),
              amount: <span className="font-medium tabular-nums">{money(t.amount)}</span>,
              ref: <span className="font-mono text-xs">{t.reference || "—"}</span>,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
