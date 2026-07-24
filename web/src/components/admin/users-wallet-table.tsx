"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { faPenToSquare, faWallet, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FaIcon } from "@/components/shared/fa-icon";
import { money } from "@/lib/admin/demo-data";
import type { AdminUser } from "@/lib/admin/demo-data";
import { Badge } from "@/components/ui/badge";

export function UsersWalletTable({ rows }: { rows: AdminUser[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [mode, setMode] = useState<"set" | "adjust">("set");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) => {
      const name = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
      return (
        name.includes(q) ||
        u.phone.includes(q) ||
        (u.email || "").toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  async function save() {
    if (!editing) return;
    const n = Number(amount);
    if (!Number.isFinite(n)) {
      toast.error("Enter a valid amount");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: editing.phone,
          mode,
          amount: n,
          reason: reason || "Admin manual edit",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.message || "Update failed");
        return;
      }
      toast.success(`Balance updated to ${money(data.balance)}`);
      setEditing(null);
      setAmount("");
      setReason("");
      router.refresh();
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, email…"
          className="w-full rounded-2xl border border-gray-200 bg-[#F3F6F4] px-4 py-2.5 text-sm outline-none ring-emerald-600/20 focus:border-emerald-500 focus:ring-4 sm:max-w-sm"
        />
        <p className="text-sm text-gray-500">{filtered.length} users</p>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-gray-100">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#F3F6F4] text-xs font-bold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3 text-right">Wallet</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 bg-white">
            {filtered.map((u) => {
              const name =
                [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
              return (
                <tr key={u.id || u.phone} className="hover:bg-emerald-50/40">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{name}</p>
                    <p className="text-xs text-gray-500">{u.email || "No email"}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{u.phone}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.authMode === "authenticated" ? "success" : "warning"}>
                      {u.authMode}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right text-base font-extrabold tabular-nums text-gray-900">
                    {money(u.walletBalance)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(u);
                        setMode("set");
                        setAmount(String(u.walletBalance || 0));
                        setReason("");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 hover:bg-emerald-700"
                    >
                      <FaIcon icon={faPenToSquare} className="h-3.5 w-3.5" />
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <FaIcon icon={faWallet} className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-bold text-gray-900">Edit wallet</p>
                  <p className="text-xs text-gray-500">{editing.phone}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <FaIcon icon={faXmark} className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="rounded-2xl bg-[#F3F6F4] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                  Current balance
                </p>
                <p className="mt-1 text-3xl font-extrabold text-gray-900">
                  {money(editing.walletBalance)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode("set");
                    setAmount(String(editing.walletBalance || 0));
                  }}
                  className={`rounded-2xl px-3 py-2.5 text-sm font-bold ${
                    mode === "set"
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Set balance
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("adjust");
                    setAmount("");
                  }}
                  className={`rounded-2xl px-3 py-2.5 text-sm font-bold ${
                    mode === "adjust"
                      ? "bg-emerald-600 text-white"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  Adjust (+/−)
                </button>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400">
                  {mode === "set" ? "New balance (₦)" : "Amount to add/subtract (₦)"}
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-lg font-bold outline-none ring-emerald-600/20 focus:border-emerald-500 focus:ring-4"
                  placeholder={mode === "adjust" ? "e.g. 500 or -200" : "e.g. 10000"}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-400">
                  Reason
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none ring-emerald-600/20 focus:border-emerald-500 focus:ring-4"
                  placeholder="Support credit, correction…"
                />
              </div>
            </div>

            <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={save}
                className="flex-1 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 disabled:opacity-60"
              >
                {loading ? "Saving…" : "Save balance"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
