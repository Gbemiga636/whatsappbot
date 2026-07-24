"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  faHouse,
  faTableCells,
  faWallet,
  faClockRotateLeft,
  faUser,
  faComments,
} from "@fortawesome/free-solid-svg-icons";
import { Logo } from "@/components/shared/logo";
import { FaIcon } from "@/components/shared/fa-icon";
import { useAuth } from "@/lib/auth-context";
import { whatsappLink } from "@/lib/constants";
import { cn, formatNaira } from "@/lib/utils";
import { formatPhoneDisplay } from "@/lib/phone";

const NAV = [
  { href: "/dashboard", label: "Home", icon: faHouse, exact: true },
  { href: "/dashboard/services", label: "Services", icon: faTableCells, exact: false },
  { href: "/dashboard/wallet", label: "Wallet", icon: faWallet, exact: false },
  { href: "/dashboard/activity", label: "History", icon: faClockRotateLeft, exact: false },
  { href: "/dashboard/settings", label: "Me", icon: faUser, exact: false },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#F5F3FA]">
        <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-violet-200 border-t-violet-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#F5F3FA] px-4">
        <Logo />
        <p className="text-center text-gray-600">Sign in with your WhatsApp number to open your wallet.</p>
        <div className="flex gap-2">
          <Link
            href="/login"
            className="rounded-2xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/25"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-2xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800"
          >
            Sign up
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#F5F3FA]">
      <header className="sticky top-0 z-30 border-b border-violet-900/5 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4 sm:max-w-2xl">
          <Logo compact />
          <div className="min-w-0 text-right">
            <p className="truncate text-sm font-bold text-gray-900">
              {user.firstName}
              {user.mode === "guest" ? " · Guest" : ""}
            </p>
            <p className="truncate text-[11px] text-violet-700">
              {user.phone
                ? formatPhoneDisplay(user.phone)
                : user.mode === "authenticated"
                  ? formatNaira(user.walletBalance)
                  : "Add phone to sync"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg px-4 pb-28 pt-5 sm:max-w-2xl sm:px-6">
        {children}
      </main>

      <a
        href={whatsappLink(
          user.phone
            ? `Hi Bygate — I'm ${user.firstName}, number ${formatPhoneDisplay(user.phone)}`
            : "Hi Bygate — I'm on the web dashboard."
        )}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-[5.5rem] right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-emerald-600/30 sm:right-6"
        aria-label="Open WhatsApp"
      >
        <FaIcon icon={faComments} className="h-5 w-5" />
      </a>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-violet-100 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
        aria-label="Main"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between px-1 sm:max-w-2xl">
          {NAV.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold transition",
                  active ? "text-violet-700" : "text-gray-400 hover:text-gray-700"
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-2xl transition",
                    active ? "bg-violet-100 text-violet-700" : "bg-transparent"
                  )}
                >
                  <FaIcon icon={item.icon} className="h-4 w-4" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
