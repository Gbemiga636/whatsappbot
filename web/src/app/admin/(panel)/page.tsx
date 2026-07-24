import Link from "next/link";
import {
  faUsers,
  faReceipt,
  faCreditCard,
  faComments,
} from "@fortawesome/free-solid-svg-icons";
import { fetchOverview } from "@/lib/admin/data";
import { money } from "@/lib/admin/demo-data";
import { AdminStatCards } from "@/components/admin/stat-cards";
import { FaIcon } from "@/components/shared/fa-icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin overview · Bygate" };

const JUMP = [
  { href: "/admin/users", label: "Edit user wallets", icon: faUsers },
  { href: "/admin/transactions", label: "All transactions", icon: faReceipt },
  { href: "/admin/payments", label: "Paystack & OPay", icon: faCreditCard },
  { href: "/admin/sessions", label: "Live WhatsApp", icon: faComments },
];

export default async function AdminOverviewPage() {
  const stats = await fetchOverview();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
            Operations
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Live wallets, payments, and WhatsApp activity.
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
            stats.source === "live"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {stats.source === "live" ? "Live data" : "Demo data"}
        </span>
      </div>

      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#071A14] via-[#0F3D2E] to-[#1A9B6C] p-6 text-white shadow-2xl shadow-emerald-900/20 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl"
        />
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-200/80">
          User wallet float
        </p>
        <p className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          {money(stats.walletFloat)}
        </p>
        <p className="mt-2 text-sm text-emerald-100/80">
          {stats.usersAuth} accounts · {stats.usersGuest} guests · {stats.usersTotal} total users
        </p>
      </section>

      <AdminStatCards stats={stats} />

      <section className="rounded-[28px] border border-white bg-white p-6 shadow-sm shadow-emerald-900/5">
        <h2 className="text-lg font-bold text-gray-900">Jump to</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {JUMP.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-[#F3F6F4] px-4 py-4 text-sm font-bold text-gray-900 transition hover:border-emerald-200 hover:bg-emerald-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <FaIcon icon={item.icon} className="h-4 w-4" />
              </span>
              {item.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
