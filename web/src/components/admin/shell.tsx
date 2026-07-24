"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  faChartPie,
  faUsers,
  faReceipt,
  faCreditCard,
  faWallet,
  faBell,
  faComments,
  faWaveSquare,
  faRightFromBracket,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import { Logo } from "@/components/shared/logo";
import { FaIcon } from "@/components/shared/fa-icon";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: faChartPie },
  { href: "/admin/users", label: "Users", icon: faUsers },
  { href: "/admin/transactions", label: "Transactions", icon: faReceipt },
  { href: "/admin/payments", label: "Payments", icon: faCreditCard },
  { href: "/admin/float", label: "Provider float", icon: faWallet },
  { href: "/admin/reminders", label: "Reminders", icon: faBell },
  { href: "/admin/sessions", label: "Live WhatsApp", icon: faComments },
  { href: "/admin/activity", label: "Activity", icon: faWaveSquare },
];

export function AdminShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#EEF2F0]">
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <aside className="hidden w-[272px] shrink-0 bg-[#071A14] text-white lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
            <Logo light />
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
              <FaIcon icon={faShieldHalved} className="h-3 w-3" />
              Admin
            </span>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition",
                    active
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-950/40"
                      : "text-white/65 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <FaIcon icon={item.icon} className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 p-4">
            <p className="truncate text-xs text-emerald-200/70">{email}</p>
            <button
              type="button"
              onClick={logout}
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-white/70 hover:bg-white/10 hover:text-white"
            >
              <FaIcon icon={faRightFromBracket} className="h-4 w-4" />
              Log out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-emerald-900/5 bg-white/90 px-4 backdrop-blur lg:px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <Logo compact />
              <span className="text-sm font-bold text-gray-900">Admin</span>
            </div>
            <p className="hidden text-sm font-medium text-gray-500 lg:block">
              Ops console · wallets · Paystack · OPay · WhatsApp
            </p>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 lg:hidden"
            >
              Log out
            </button>
          </header>

          <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2 py-2 lg:hidden">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold",
                  (item.href === "/admin"
                    ? pathname === "/admin"
                    : pathname.startsWith(item.href))
                    ? "bg-emerald-50 text-emerald-800"
                    : "text-gray-600"
                )}
              >
                <FaIcon icon={item.icon} className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            ))}
          </nav>

          <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
