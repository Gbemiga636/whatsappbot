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
  faBolt,
  faGear,
} from "@fortawesome/free-solid-svg-icons";
import { Logo } from "@/components/shared/logo";
import { FaIcon } from "@/components/shared/fa-icon";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Command",
    items: [
      { href: "/admin", label: "Overview", icon: faChartPie },
      { href: "/admin/activity", label: "Activity feed", icon: faWaveSquare },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/admin/users", label: "Users & wallets", icon: faUsers },
      { href: "/admin/transactions", label: "Transactions", icon: faReceipt },
      { href: "/admin/payments", label: "Payments", icon: faCreditCard },
      { href: "/admin/float", label: "Provider float", icon: faWallet },
    ],
  },
  {
    label: "WhatsApp ops",
    items: [
      { href: "/admin/sessions", label: "Live sessions", icon: faComments },
      { href: "/admin/reminders", label: "Reminders", icon: faBell },
    ],
  },
];

const FLAT_NAV = NAV_GROUPS.flatMap((g) => g.items);

export function AdminShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(href: string) {
    return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  }

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
    <div className="min-h-screen bg-[#F3F0F8]">
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="hidden w-[280px] shrink-0 bg-[#14081F] text-white lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
            <Logo light />
            <span className="inline-flex items-center gap-1 rounded-lg bg-violet-500/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-300">
              <FaIcon icon={faShieldHalved} className="h-3 w-3" />
              Admin
            </span>
          </div>

          <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition",
                          active
                            ? "bg-violet-500 text-white shadow-lg shadow-violet-950/40"
                            : "text-white/65 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <FaIcon icon={item.icon} className="h-4 w-4" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-white/10 p-4">
            <div className="rounded-2xl bg-white/5 p-3">
              <p className="flex items-center gap-2 text-xs font-bold text-violet-200">
                <FaIcon icon={faBolt} className="h-3 w-3" />
                Ops desk
              </p>
              <p className="mt-1 truncate text-[11px] text-white/50">{email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="mt-3 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-white/70 hover:bg-white/10 hover:text-white"
            >
              <FaIcon icon={faRightFromBracket} className="h-4 w-4" />
              Log out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-violet-900/5 bg-white/90 backdrop-blur">
            <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-6">
              <div className="flex min-w-0 items-center gap-2 lg:hidden">
                <Logo compact />
                <span className="text-sm font-bold text-gray-900">Admin</span>
              </div>
              <div className="hidden min-w-0 items-center gap-3 lg:flex">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                  Console online
                </span>
                <p className="truncate text-sm text-gray-500">
                  Wallets · Paystack · OPay · ClubKonnect · WhatsApp
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/admin/users"
                  className="hidden rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-violet-600/25 sm:inline-flex"
                >
                  Edit balances
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700"
                >
                  <FaIcon icon={faGear} className="h-3 w-3 lg:hidden" />
                  <span className="lg:hidden">Out</span>
                  <span className="hidden lg:inline">Log out</span>
                </button>
              </div>
            </div>
          </header>

          <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2 py-2 lg:hidden">
            {FLAT_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold",
                  isActive(item.href) ? "bg-violet-50 text-violet-800" : "text-gray-600"
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
