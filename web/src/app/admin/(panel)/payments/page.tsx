import { fetchTransactions, fetchOverview } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import { DataTable, LiveBadge, StatCard } from "@/components/admin/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Payments · Admin" };

export default async function AdminPaymentsPage() {
  const [stats, tx] = await Promise.all([fetchOverview(), fetchTransactions(300)]);
  const paymentRows = tx.rows.filter(
    (r) =>
      r.provider === "paystack" ||
      r.provider === "opay" ||
      r.type === "topup" ||
      r.type === "topup_gift" ||
      r.type === "guest_purchase"
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Payments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Money entering via Paystack and direct OPay checkout.
          </p>
        </div>
        <LiveBadge live={stats.source === "live"} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Paystack inflow" value={money(stats.paystackIn)} tone="success" />
        <StatCard label="OPay inflow" value={money(stats.opayIn)} tone="success" />
        <StatCard
          label="Combined inflow"
          value={money(stats.paystackIn + stats.opayIn)}
          hint="Completed payments only"
        />
        <StatCard
          label="Payment rows"
          value={String(paymentRows.length)}
          hint="Top-ups + guest checkouts"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment transactions</CardTitle>
          <CardDescription>Paystack & OPay related activity</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "when", label: "When" },
              { key: "phone", label: "Phone" },
              { key: "provider", label: "Rail" },
              { key: "type", label: "Type" },
              { key: "status", label: "Status" },
              { key: "amount", label: "Amount", className: "text-right" },
              { key: "ref", label: "Reference" },
            ]}
            rows={paymentRows.map((t) => ({
              when: new Date(t.createdAt).toLocaleString("en-NG"),
              phone: t.phone,
              provider: (
                <Badge variant={t.provider === "opay" ? "default" : "outline"}>
                  {t.provider || "—"}
                </Badge>
              ),
              type: t.type,
              status: t.status,
              amount: <span className="font-medium tabular-nums">{money(t.amount)}</span>,
              ref: <span className="font-mono text-xs">{t.reference || "—"}</span>,
            }))}
            empty="No payment transactions yet"
          />
        </CardContent>
      </Card>
    </div>
  );
}
