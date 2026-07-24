"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  faChartPie,
  faWallet,
  faClockRotateLeft,
  faGear,
  faRightFromBracket,
  faComments,
} from "@fortawesome/free-solid-svg-icons";
import { Logo } from "@/components/shared/logo";
import { FaIcon } from "@/components/shared/fa-icon";
import { useAuth } from "@/lib/auth-context";
import { whatsappLink } from "@/lib/constants";
import { cn, formatNaira } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Home", icon: faChartPie },
  { href: "/dashboard/wallet", label: "Wallet", icon: faWallet },
  { href: "/dashboard/activity", label: "History", icon: faClockRotateLeft },
  { href: "/dashboard/settings", label: "Settings", icon: faGear },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F6F4]">
        <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-emerald-200 border-t-emerald-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F3F6F4] px-4">
        <p className="text-gray-600">Sign in to open your Bygate wallet.</p>
        <div className="flex gap-2">
          <Link
            href="/login"
            className="rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25"
          >
            Log in
          </Link>
          <Link
            href="/signup?mode=guest"
            className="rounded-2xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800"
          >
            Continue as guest
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F6F4]">
      <div className="mx-auto flex min-h-screen max-w-6xl">
        <aside className="hidden w-[260px] shrink-0 bg-[#0B1F17] text-white md:flex md:flex-col">
          <div className="flex h-16 items-center px-5">
            <Logo light />
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Dashboard">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition",
                    active
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/30"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <FaIcon icon={item.icon} className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-white/10 p-4">
            <p className="truncate text-sm font-semibold">
              {user.firstName}
              {user.mode === "guest" ? " · Guest" : ""}
            </p>
            <p className="mt-0.5 truncate text-xs text-emerald-200/80">
              {user.mode === "authenticated"
                ? formatNaira(user.walletBalance)
                : "Pay at checkout"}
            </p>
            <button
              type="button"
              className="mt-3 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => {
                logout();
                router.push("/");
              }}
            >
              <FaIcon icon={faRightFromBracket} className="h-4 w-4" />
              Log out
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-emerald-900/5 bg-white/90 px-4 backdrop-blur-md sm:px-6">
            <div className="md:hidden">
              <Logo compact />
            </div>
            <p className="hidden text-sm font-medium text-gray-500 md:block">
              Your money · airtime · bills
            </p>
            <a
              href={whatsappLink("Hi Bygate — I'm on the web dashboard.")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#25D366] px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-emerald-500/20"
            >
              <FaIcon icon={faComments} className="h-4 w-4" />
              WhatsApp
            </a>
          </header>

          <nav
            className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2 py-2 md:hidden"
            aria-label="Mobile dashboard"
          >
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-semibold",
                  pathname === item.href
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
