"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  faEye,
  faEyeSlash,
  faShieldHalved,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import { FaIcon } from "@/components/shared/fa-icon";
import { Logo } from "@/components/shared/logo";

function safeNextPath() {
  try {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/admin/login")) {
      return next;
    }
  } catch {
    /* ignore */
  }
  return "/admin";
}

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => email.includes("@") && password.length >= 4, [email, password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.message || "Login failed");
        setLoading(false);
        return;
      }
      window.location.href = safeNextPath();
    } catch {
      setError("Network error — try again");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1a0b2e] px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-fuchsia-400/15 blur-3xl"
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-black/40">
        <div className="bg-gradient-to-br from-[#1a0b2e] via-[#3b1d6e] to-[#7c3aed] px-8 py-7 text-white">
          <Logo light />
          <div className="mt-6 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
              <FaIcon icon={faShieldHalved} className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Admin console</h1>
              <p className="text-sm text-violet-100/80">Wallets · payments · WhatsApp ops</p>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-8 py-7">
          <div className="space-y-2">
            <label htmlFor="admin-email" className="block text-xs font-bold uppercase tracking-wide text-gray-400">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@bygate.app"
              className="w-full rounded-2xl border border-gray-200 bg-[#F5F3FA] px-4 py-3 text-sm outline-none ring-violet-600/20 focus:border-violet-500 focus:bg-white focus:ring-4"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="admin-password" className="block text-xs font-bold uppercase tracking-wide text-gray-400">
              Password
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-[#F5F3FA] px-4 py-3 pr-12 text-sm outline-none ring-violet-600/20 focus:border-violet-500 focus:bg-white focus:ring-4"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                <FaIcon icon={show ? faEyeSlash : faEye} className="h-4 w-4" />
              </button>
            </div>
          </div>
          {error ? (
            <p className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FaIcon icon={faLock} className="h-3.5 w-3.5" />
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-xs text-gray-400">
            <Link href="/" className="font-semibold text-violet-700 hover:underline">
              Back to Bygate
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
