"use client";

import Link from "next/link";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { faPlus, faWallet, faComments } from "@fortawesome/free-solid-svg-icons";
import { DashboardShell } from "@/components/dashboard/shell";
import { FaIcon } from "@/components/shared/fa-icon";
import { useAuth } from "@/lib/auth-context";
import { formatNaira } from "@/lib/utils";
import { whatsappLink } from "@/lib/constants";
import { formatPhoneDisplay } from "@/lib/phone";

export default function WalletPage() {
  const { user, refreshWallet } = useAuth();
  const [amount, setAmount] = useState("5000");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  const isGuest = user?.mode === "guest";

  async function openWhatsAppTopUp(provider: "Paystack" | "OPay") {
    if (!user || isGuest) {
      toast.error("Create an account with your WhatsApp number to top up");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 300));
    setLoading(false);
    const phoneHint = user.phone ? ` for ${formatPhoneDisplay(user.phone)}` : "";
    window.open(
      whatsappLink(`I want to top up my wallet ₦${amount}${phoneHint} with ${provider}`),
      "_blank"
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1a0b2e] via-[#3b1d6e] to-[#7c3aed] p-6 text-white shadow-2xl shadow-violet-900/30">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10 blur-2xl"
          />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-200/80">
                Wallet balance
              </p>
              <p className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
                {isGuest ? "₦0.00" : formatNaira(user?.walletBalance || 0)}
              </p>
              {user?.phone ? (
                <p className="mt-2 text-sm text-violet-100/80">
                  {formatPhoneDisplay(user.phone)} · synced with WhatsApp
                </p>
              ) : null}
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <FaIcon icon={faWallet} className="h-5 w-5" />
            </span>
          </div>
        </section>

        <section className="rounded-[28px] border border-white bg-white p-6 shadow-sm shadow-violet-900/5">
          {isGuest ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-gray-600">
                Guests pay per order on WhatsApp. Sign up with your number for a reusable wallet.
              </p>
              <Link
                href="/signup"
                className="inline-flex rounded-2xl bg-violet-600 px-5 py-3 text-sm font-bold text-white"
              >
                Create account
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Top up</h2>
              <input
                type="number"
                min={100}
                step={100}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-xl font-extrabold outline-none ring-violet-600/20 focus:border-violet-500 focus:ring-4"
              />
              <div className="flex flex-wrap gap-2">
                {["1000", "2000", "5000", "10000"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(v)}
                    className="rounded-xl border border-gray-200 bg-[#F5F3FA] px-3 py-2 text-sm font-bold text-gray-800"
                  >
                    ₦{Number(v).toLocaleString()}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => openWhatsAppTopUp("Paystack")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-600/25 disabled:opacity-60"
                >
                  <FaIcon icon={faPlus} className="h-3.5 w-3.5" />
                  Paystack
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => openWhatsAppTopUp("OPay")}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3.5 text-sm font-bold text-violet-900 disabled:opacity-60"
                >
                  OPay
                </button>
              </div>
              <a
                href={whatsappLink("I want to top up my wallet")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white"
              >
                <FaIcon icon={faComments} className="h-4 w-4" />
                Continue on WhatsApp
              </a>
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
