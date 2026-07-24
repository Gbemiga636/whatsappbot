import {
  faCreditCard,
  faMoneyBillWave,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import { fetchTransactions, fetchOverview } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import {
  AdminPageHeader,
  AdminPanel,
  DataTable,
  MetricBox,
} from "@/components/admin/ui";
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
  const combined = stats.paystackIn + stats.opayIn;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Payments"
        description="Money entering via Paystack and direct OPay checkout."
        live={stats.source === "live"}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricBox
          label="Paystack inflow"
          value={money(stats.paystackIn)}
          hint="Completed"
          icon={faCreditCard}
          tone="violet"
        />
        <MetricBox
          label="OPay inflow"
          value={money(stats.opayIn)}
          hint="Direct checkout"
          icon={faCreditCard}
          tone="fuchsia"
        />
        <MetricBox
          label="Combined"
          value={money(combined)}
          hint="Both rails"
          icon={faMoneyBillWave}
          tone="emerald"
        />
        <MetricBox
          label="Payment rows"
          value={String(paymentRows.length)}
          hint="Top-ups + guest"
          icon={faLayerGroup}
          tone="sky"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[28px] bg-gradient-to-br from-[#1a0b2e] via-[#3b1d6e] to-[#7c3aed] p-6 text-white shadow-xl shadow-violet-900/20">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-200/80">
            Paystack share
          </p>
          <p className="mt-3 text-3xl font-extrabold">
            {combined > 0 ? Math.round((stats.paystackIn / combined) * 100) : 0}%
          </p>
          <p className="mt-2 text-sm text-violet-100/75">{money(stats.paystackIn)} of total inflow</p>
        </div>
        <div className="rounded-[28px] border border-white bg-white p-6 shadow-sm shadow-violet-900/5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
            OPay share
          </p>
          <p className="mt-3 text-3xl font-extrabold text-gray-900">
            {combined > 0 ? Math.round((stats.opayIn / combined) * 100) : 0}%
          </p>
          <p className="mt-2 text-sm text-gray-500">{money(stats.opayIn)} of total inflow</p>
        </div>
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
