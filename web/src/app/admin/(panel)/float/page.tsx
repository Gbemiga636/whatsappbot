import {
  faWallet,
  faBuildingColumns,
  faCreditCard,
} from "@fortawesome/free-solid-svg-icons";
import { fetchClubKonnectBalance, fetchOverview } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import { AdminPageHeader, MetricBox, SectionCard } from "@/components/admin/ui";

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

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1a0b2e] via-[#3b1d6e] to-[#7c3aed] p-6 text-white shadow-2xl shadow-violet-900/20">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-200/80">
            ClubKonnect
          </p>
          <p className="mt-3 text-4xl font-extrabold tracking-tight">
            {float.balance != null ? money(float.balance) : "—"}
          </p>
          <p className="mt-2 text-sm text-violet-100/75">
            {float.ok ? float.message || "Live provider balance" : float.message}
          </p>
        </section>
        <MetricBox
          label="Customer wallet float"
          value={money(stats.walletFloat)}
          hint="Sum of user balances (liability)"
          icon={faWallet}
          tone="fuchsia"
          href="/admin/users"
        />
        <MetricBox
          label="Paystack cash in"
          value={money(stats.paystackIn)}
          hint="Completed Paystack payments"
          icon={faCreditCard}
          tone="violet"
          href="/admin/payments"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricBox
          label="OPay inflow"
          value={money(stats.opayIn)}
          hint="Direct checkout"
          icon={faBuildingColumns}
          tone="amber"
          href="/admin/payments"
        />
        <MetricBox
          label="Combined inflow"
          value={money(stats.paystackIn + stats.opayIn)}
          hint="Paystack + OPay"
          icon={faCreditCard}
          tone="emerald"
          href="/admin/payments"
        />
      </div>

      <SectionCard title="How to read this" description="Keep float healthy so airtime/bills never fail">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            {
              title: "ClubKonnect",
              body: "Business float used to fulfill MTN/Glo/Airtel/9mobile and bills. Fund it at clubkonnect.com when low.",
            },
            {
              title: "Paystack / OPay",
              body: "Money customers pay you. Funds wallets or guest checkout — fulfillment still spends ClubKonnect.",
            },
            {
              title: "Env keys",
              body: "Add CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY to web/.env.local (and Netlify) for a live balance.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-2xl bg-[#F8F6FC] p-4">
              <p className="font-bold text-gray-900">{c.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">{c.body}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
