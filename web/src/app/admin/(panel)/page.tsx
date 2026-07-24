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
              ? "bg-violet-100 text-violet-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {stats.source === "live" ? "Live data" : "Demo data"}
        </span>
      </div>

      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1a0b2e] via-[#3b1d6e] to-[#7c3aed] p-6 text-white shadow-2xl shadow-violet-900/20 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl"
        />
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-200/80">
          User wallet float
        </p>
        <p className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
          {money(stats.walletFloat)}
        </p>
        <p className="mt-2 text-sm text-violet-100/80">
          {stats.usersAuth} accounts · {stats.usersGuest} guests · {stats.usersTotal} total users
        </p>
      </section>

      <AdminStatCards stats={stats} />

      <section className="rounded-[28px] border border-white bg-white p-6 shadow-sm shadow-violet-900/5">
        <h2 className="text-lg font-bold text-gray-900">Jump to</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {JUMP.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-[#F5F3FA] px-4 py-4 text-sm font-bold text-gray-900 transition hover:border-violet-200 hover:bg-violet-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
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
