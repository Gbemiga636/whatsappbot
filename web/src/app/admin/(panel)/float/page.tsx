import { fetchClubKonnectBalance, fetchOverview } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import { LiveBadge, StatCard } from "@/components/admin/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "ClubKonnect float · Admin" };

export default async function AdminFloatPage() {
  const [float, stats] = await Promise.all([fetchClubKonnectBalance(), fetchOverview()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Provider float</h1>
          <p className="mt-1 text-sm text-gray-500">
            Business VTU wallet (ClubKonnect) vs customer wallets on Bygate.
          </p>
        </div>
        <LiveBadge live={stats.source === "live"} />
      </div>

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

      <Card>
        <CardHeader>
          <CardTitle>How to read this</CardTitle>
          <CardDescription>Keep float healthy so airtime/bills never fail</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-gray-600">
          <p>
            <strong className="text-gray-900">ClubKonnect</strong> is your business float used to
            fulfill MTN/Glo/Airtel/9mobile and bills. Fund it at clubkonnect.com when low.
          </p>
          <p>
            <strong className="text-gray-900">Paystack / OPay</strong> is money customers pay you.
            That funds user wallets (or guest checkout) — fulfillment still spends ClubKonnect.
          </p>
          <p>
            Add <code className="rounded bg-gray-100 px-1">CLUBKONNECT_USER_ID</code> and{" "}
            <code className="rounded bg-gray-100 px-1">CLUBKONNECT_API_KEY</code> to{" "}
            <code className="rounded bg-gray-100 px-1">web/.env.local</code> for a live balance
            here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
