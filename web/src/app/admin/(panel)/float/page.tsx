import { fetchClubKonnectBalance, fetchOverview } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import { AdminPageHeader, AdminPanel, StatCard } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "ClubKonnect float · Admin" };

export default async function AdminFloatPage() {
  const [float, stats] = await Promise.all([fetchClubKonnectBalance(), fetchOverview()]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Provider float"
        description="Business VTU wallet (ClubKonnect) vs customer wallets on Bygate."
        live={stats.source === "live"}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="ClubKonnect balance"
          value={float.balance != null ? money(float.balance) : "—"}
          hint={float.ok ? float.message : float.message}
          tone={float.ok ? "success" : "warning"}
        />
        <StatCard
          label="Customer wallet float"
          value={money(stats.walletFloat)}
          hint="Sum of user balances (liability)"
        />
        <StatCard
          label="Paystack cash in"
          value={money(stats.paystackIn)}
          hint="Completed Paystack payments"
          tone="success"
        />
      </div>

      <AdminPanel>
        <h2 className="text-lg font-bold text-gray-900">How to read this</h2>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-600">
          <p>
            <strong className="text-gray-900">ClubKonnect</strong> is your business float used to
            fulfill MTN/Glo/Airtel/9mobile and bills. Fund it at clubkonnect.com when low.
          </p>
          <p>
            <strong className="text-gray-900">Paystack / OPay</strong> is money customers pay you.
            That funds user wallets (or guest checkout) — fulfillment still spends ClubKonnect.
          </p>
          <p>
            Add <code className="rounded bg-[#F3F6F4] px-1.5 py-0.5">CLUBKONNECT_USER_ID</code> and{" "}
            <code className="rounded bg-[#F3F6F4] px-1.5 py-0.5">CLUBKONNECT_API_KEY</code> to{" "}
            <code className="rounded bg-[#F3F6F4] px-1.5 py-0.5">web/.env.local</code> for a live
            balance here.
          </p>
        </div>
      </AdminPanel>
    </div>
  );
}
