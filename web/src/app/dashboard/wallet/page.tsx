"use client";

import Link from "next/link";
import { toast } from "sonner";
import { DashboardShell } from "@/components/dashboard/shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { formatNaira } from "@/lib/utils";
import { WhatsAppCTA } from "@/components/shared/whatsapp-cta";
import { useState } from "react";

export default function WalletPage() {
  const { user } = useAuth();
  const [amount, setAmount] = useState("5000");
  const [loading, setLoading] = useState(false);

  async function onTopUp(e: React.FormEvent) {
    e.preventDefault();
    if (!user || user.mode === "guest") {
      toast.error("Create an account to top up a wallet");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    toast.success("Paystack checkout opens from WhatsApp for now — use the bot to top up.");
  }

  return (
    <DashboardShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Wallet</h1>
          <p className="mt-1 text-sm text-gray-500">
            Top up with Paystack or OPay, then spend instantly on airtime and bills.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardDescription>Available balance</CardDescription>
            <CardTitle className="text-4xl">
              {user?.mode === "guest" ? "—" : formatNaira(user?.walletBalance || 0)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user?.mode === "guest" ? (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Guests pay per order on WhatsApp.{" "}
                <Link href="/signup" className="font-medium underline">
                  Sign up
                </Link>{" "}
                for a reusable wallet.
              </div>
            ) : (
              <form onSubmit={onTopUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Top-up amount (₦)</Label>
                  <Input
                    id="amount"
                    type="number"
                    min={100}
                    step={100}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {["1000", "2000", "5000", "10000"].map((v) => (
                    <Button
                      key={v}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAmount(v)}
                    >
                      ₦{Number(v).toLocaleString()}
                    </Button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    loading={loading}
                    className="w-full"
                    onClick={async () => {
                      if (!user || user.mode === "guest") {
                        toast.error("Create an account to top up a wallet");
                        return;
                      }
                      setLoading(true);
                      await new Promise((r) => setTimeout(r, 500));
                      setLoading(false);
                      toast.success("Open WhatsApp and choose Paystack at checkout");
                    }}
                  >
                    Pay with Paystack
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    loading={loading}
                    className="w-full"
                    onClick={async () => {
                      if (!user || user.mode === "guest") {
                        toast.error("Create an account to top up a wallet");
                        return;
                      }
                      setLoading(true);
                      await new Promise((r) => setTimeout(r, 500));
                      setLoading(false);
                      toast.success("Open WhatsApp and choose OPay at checkout");
                    }}
                  >
                    Pay with OPay
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prefer WhatsApp?</CardTitle>
            <CardDescription>
              Say “top up wallet 5000” in the bot — then choose Paystack or OPay.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WhatsAppCTA message="I want to top up my wallet" />
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
