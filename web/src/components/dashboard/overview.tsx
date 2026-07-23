"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownLeft, ArrowUpRight, Bell, Smartphone, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { formatNaira } from "@/lib/utils";
import { WhatsAppCTA } from "@/components/shared/whatsapp-cta";
import Link from "next/link";

const chartData = [
  { day: "Mon", spend: 1200 },
  { day: "Tue", spend: 800 },
  { day: "Wed", spend: 2100 },
  { day: "Thu", spend: 500 },
  { day: "Fri", spend: 3200 },
  { day: "Sat", spend: 1500 },
  { day: "Sun", spend: 900 },
];

const activity = [
  { id: 1, title: "MTN airtime · 0803…", amount: -500, time: "2h ago", icon: Smartphone },
  { id: 2, title: "Wallet top-up", amount: 5000, time: "Yesterday", icon: ArrowDownLeft },
  { id: 3, title: "IKEDC electricity", amount: -3500, time: "Mon", icon: Zap },
  { id: 4, title: "Reminder set", amount: 0, time: "Mon", icon: Bell },
];

export function Overview() {
  const { user } = useAuth();
  if (!user) return null;

  const isGuest = user.mode === "guest";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Good day, {user.firstName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isGuest
              ? "Guest mode — pay with Paystack on WhatsApp. Sign up for a wallet."
              : "Here’s your wallet and recent activity."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <WhatsAppCTA size="sm" />
          {!isGuest && (
            <Button asChild size="sm">
              <Link href="/dashboard/wallet">Top up wallet</Link>
            </Button>
          )}
          {isGuest && (
            <Button asChild size="sm">
              <Link href="/signup">Create account</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="hover:shadow-md">
          <CardHeader className="pb-2">
            <CardDescription>Wallet balance</CardDescription>
            <CardTitle className="text-3xl">
              {isGuest ? "—" : formatNaira(user.walletBalance)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={isGuest ? "warning" : "success"}>
              {isGuest ? "Guest · no wallet" : "Active"}
            </Badge>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md">
          <CardHeader className="pb-2">
            <CardDescription>This week spend</CardDescription>
            <CardTitle className="text-3xl">{isGuest ? "—" : "₦10,200"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-500">Across airtime & bills</CardContent>
        </Card>
        <Card className="hover:shadow-md">
          <CardHeader className="pb-2">
            <CardDescription>Transactions</CardDescription>
            <CardTitle className="text-3xl">{isGuest ? "0" : "18"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-500">Last 30 days</CardContent>
        </Card>
        <Card className="hover:shadow-md">
          <CardHeader className="pb-2">
            <CardDescription>Reminders</CardDescription>
            <CardTitle className="text-3xl">{isGuest ? "0" : "3"}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-500">Active WhatsApp alerts</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Spend overview</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {isGuest ? (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 text-center">
                <p className="text-sm font-medium text-gray-700">No spend data yet</p>
                <p className="mt-1 max-w-xs text-xs text-gray-500">
                  Create an account and top up to see analytics here.
                </p>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/signup">Sign up</Link>
                </Button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="spend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6D28D9" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#6D28D9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #E5E7EB",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    stroke="#6D28D9"
                    strokeWidth={2}
                    fill="url(#spend)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Latest wallet & bot events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isGuest ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
                Activity appears after your first purchase on WhatsApp.
              </div>
            ) : (
              activity.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 bg-[#FAFAFC] px-3 py-3"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-gray-100">
                      <Icon className="h-4 w-4 text-violet-700" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-500">{item.time}</p>
                    </div>
                    <span
                      className={cnAmount(item.amount)}
                    >
                      {item.amount === 0
                        ? "—"
                        : item.amount > 0
                          ? `+${formatNaira(item.amount)}`
                          : formatNaira(item.amount)}
                    </span>
                  </div>
                );
              })
            )}
            <Button asChild variant="outline" className="w-full" size="sm">
              <Link href="/dashboard/activity">View all</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
          <CardDescription>Jump into WhatsApp with a ready-made prompt</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <WhatsAppCTA size="sm" label="Buy airtime" message="I want to buy airtime" />
          <WhatsAppCTA size="sm" label="Pay a bill" message="I want to pay a bill" />
          <WhatsAppCTA
            size="sm"
            label="Set reminder"
            message="Remind me to drink water every day at 8am"
          />
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/wallet">
              <ArrowUpRight className="h-4 w-4" />
              Wallet
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function cnAmount(amount: number) {
  if (amount > 0) return "text-sm font-medium text-emerald-600";
  if (amount < 0) return "text-sm font-medium text-gray-900";
  return "text-sm font-medium text-gray-400";
}
