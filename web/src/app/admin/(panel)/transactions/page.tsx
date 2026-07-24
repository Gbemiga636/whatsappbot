import {
  faReceipt,
  faCircleCheck,
  faClock,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { fetchTransactions } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import {
  AdminPageHeader,
  AdminPanel,
  DataTable,
  MetricBox,
} from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Transactions · Admin" };

export default async function AdminTransactionsPage() {
  const { rows, live } = await fetchTransactions(250);
  const completed = rows.filter((r) => r.status === "completed").length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const volume = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Transactions"
        description="Every airtime, bill, top-up, and guest checkout — WhatsApp & web."
        live={live}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricBox
          label="Loaded"
          value={String(rows.length)}
          hint={money(volume) + " volume"}
          icon={faReceipt}
          tone="violet"
        />
        <MetricBox
          label="Completed"
          value={String(completed)}
          hint="Fulfilled"
          icon={faCircleCheck}
          tone="emerald"
        />
        <MetricBox
          label="Pending"
          value={String(pending)}
          hint="Awaiting payment"
          icon={faClock}
          tone="orange"
        />
        <MetricBox
          label="Failed"
          value={String(failed)}
          hint="Needs review"
          icon={faTriangleExclamation}
          tone="rose"
        />
      </div>

      <AdminPanel>
        <p className="mb-4 text-sm font-bold text-gray-900">Ledger · newest first</p>
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
            amount: <span className="font-bold tabular-nums">{money(t.amount)}</span>,
            ref: <span className="font-mono text-xs">{t.reference || "—"}</span>,
          }))}
        />
      </AdminPanel>
    </div>
  );
}
