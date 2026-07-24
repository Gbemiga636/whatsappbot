"use client";

import Link from "next/link";
import { toast } from "sonner";
import {
  faUser,
  faRightFromBracket,
  faShieldHalved,
} from "@fortawesome/free-solid-svg-icons";
import { DashboardShell } from "@/components/dashboard/shell";
import { FaIcon } from "@/components/shared/fa-icon";
import { useAuth } from "@/lib/auth-context";

export default function SettingsPage() {
  const { user, logout } = useAuth();

  return (
    <DashboardShell>
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
            Settings
          </h1>
          <p className="mt-1 text-sm text-gray-500">Profile and account</p>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-white bg-white shadow-sm shadow-emerald-900/5">
          <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <FaIcon icon={faUser} className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-bold text-gray-900">Profile</h2>
              <p className="text-xs text-gray-500">How you appear on Bygate</p>
            </div>
          </div>
          <div className="space-y-4 px-5 py-5">
            {[
              { label: "Name", value: user?.firstName || "—" },
              { label: "Email", value: user?.email || "—" },
              {
                label: "Account",
                value: user?.mode === "guest" ? "Guest" : "Authenticated",
              },
            ].map((f) => (
              <div key={f.label}>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
                  {f.label}
                </p>
                <div className="rounded-2xl bg-[#F3F6F4] px-4 py-3 text-sm font-semibold text-gray-900">
                  {f.value}
                </div>
              </div>
            ))}
            {user?.mode === "guest" ? (
              <Link
                href="/signup"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25"
              >
                <FaIcon icon={faShieldHalved} className="h-3.5 w-3.5" />
                Upgrade to full account
              </Link>
            ) : null}
          </div>
        </section>

        <section className="rounded-[28px] border border-white bg-white p-5 shadow-sm shadow-emerald-900/5">
          <button
            type="button"
            onClick={() => {
              logout();
              toast.success("Signed out");
              window.location.href = "/";
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
          >
            <FaIcon icon={faRightFromBracket} className="h-3.5 w-3.5" />
            Log out
          </button>
        </section>
      </div>
    </DashboardShell>
  );
}
