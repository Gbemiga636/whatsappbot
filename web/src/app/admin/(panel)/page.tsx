import Link from "next/link";
import { fetchOverview } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin overview · Bygate" };

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900 tabular-nums sm:text-3xl">
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export default async function AdminOverviewPage() {
  const stats = await fetchOverview();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Overview</h1>
          <p className="mt-1 text-sm text-gray-500">
            Everything happening across WhatsApp bot and the web app.
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
            stats.source === "live"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-amber-50 text-amber-700"
          }`}
        >
          {stats.source === "live"
            ? "Live Supabase"
            : "Demo data — connect Supabase service role"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          label="Total users"
          value={String(stats.usersTotal)}
          hint={`${stats.usersAuth} accounts · ${stats.usersGuest} guests`}
        />
        <Card
          label="User wallet float"
          value={money(stats.walletFloat)}
          hint="Sum of Bygate wallets"
        />
        <Card
          label="Transactions"
          value={String(stats.txTotal)}
          hint={`${stats.txCompleted} ok · ${stats.txPending} pending · ${stats.txFailed} failed`}
        />
        <Card
          label="Live WhatsApp sessions"
          value={String(stats.liveSessions)}
          hint="Active bot sessions"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card label="Paystack inflow" value={money(stats.paystackIn)} hint="Completed payments" />
        <Card label="OPay inflow" value={money(stats.opayIn)} hint="Direct OPay checkouts" />
        <Card
          label="Active reminders"
          value={String(stats.remindersActive)}
          hint={`${stats.remindersDueSoon} due in 24h`}
        />
        <Card label="Failed txs" value={String(stats.txFailed)} hint="Needs review" />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Quick links</h2>
        <p className="mt-1 text-sm text-gray-500">Jump into the areas you check most</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["/admin/transactions", "All transactions"],
            ["/admin/users", "All users"],
            ["/admin/payments", "Paystack & OPay"],
            ["/admin/float", "ClubKonnect float"],
            ["/admin/sessions", "Live WhatsApp"],
            ["/admin/reminders", "Reminders"],
            ["/admin/activity", "Activity feed"],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
