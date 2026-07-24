import { fetchTransactions, fetchOverview } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import { AdminPageHeader, AdminPanel, DataTable, StatCard } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
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
      <AdminPageHeader
        title="Payments"
        description="Money entering via Paystack and direct OPay checkout."
        live={stats.source === "live"}
      />

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

      <AdminPanel>
        <p className="mb-4 text-sm font-bold text-gray-900">Payment transactions</p>
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
            amount: <span className="font-bold tabular-nums">{money(t.amount)}</span>,
            ref: <span className="font-mono text-xs">{t.reference || "—"}</span>,
          }))}
          empty="No payment transactions yet"
        />
      </AdminPanel>
    </div>
  );
}
