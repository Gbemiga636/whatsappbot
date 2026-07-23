"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/transactions", label: "Transactions", icon: Receipt },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/float", label: "ClubKonnect float", icon: Wallet },
  { href: "/admin/reminders", label: "Reminders", icon: Bell },
  { href: "/admin/sessions", label: "Live WhatsApp", icon: MessageCircle },
  { href: "/admin/activity", label: "Activity feed", icon: Activity },
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
    <div className="min-h-screen bg-[#F4F5F7]">
      <div className="mx-auto flex min-h-screen max-w-[1400px]">
        <aside className="hidden w-64 shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col">
          <div className="flex h-16 items-center gap-2 border-b border-gray-100 px-5">
            <Logo />
            <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
              Admin
            </span>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV.map((item) => {
              const active =
                item.href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-violet-50 text-violet-900"
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
            <p className="truncate text-xs text-gray-500">{email}</p>
            <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-gray-200 bg-white/90 px-4 backdrop-blur lg:px-6">
            <div className="flex items-center gap-2 lg:hidden">
              <Logo compact />
              <span className="text-sm font-semibold text-gray-900">Admin</span>
            </div>
            <p className="hidden text-sm text-gray-500 lg:block">
              Operations · WhatsApp + Web · Paystack · ClubKonnect
            </p>
            <Button variant="outline" size="sm" className="lg:hidden" onClick={logout}>
              Log out
            </Button>
          </header>

          <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2 py-2 lg:hidden">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium",
                  (item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href))
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
