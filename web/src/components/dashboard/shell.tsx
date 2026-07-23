"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Settings,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { whatsappLink } from "@/lib/constants";
import { cn, formatNaira } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAFAFC]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#FAFAFC] px-4">
        <p className="text-gray-600">Sign in to view your dashboard.</p>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/signup?mode=guest">Continue as guest</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFC]">
      <div className="mx-auto flex min-h-screen max-w-6xl">
        <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white md:flex md:flex-col">
          <div className="flex h-16 items-center px-5">
            <Logo />
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Dashboard">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-violet-50 text-violet-800"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-gray-100 p-4">
            <p className="truncate text-sm font-medium text-gray-900">
              {user.firstName}
              {user.mode === "guest" ? " · Guest" : ""}
            </p>
            <p className="truncate text-xs text-gray-500">
              {user.mode === "authenticated"
                ? formatNaira(user.walletBalance)
                : "Pay with Paystack"}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full justify-start"
              onClick={() => {
                logout();
                router.push("/");
              }}
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white/90 px-4 backdrop-blur-md sm:px-6">
            <div className="md:hidden">
              <Logo compact />
            </div>
            <p className="hidden text-sm text-gray-500 md:block">
              Manage wallet · jump to WhatsApp anytime
            </p>
            <Button asChild variant="whatsapp" size="sm">
              <a href={whatsappLink("Hi Bygate — I'm on the web dashboard.")} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            </Button>
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
                  "whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium",
                  pathname === item.href
                    ? "bg-violet-50 text-violet-800"
                    : "text-gray-600"
                )}
              >
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
