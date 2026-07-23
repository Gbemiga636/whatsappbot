"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye, EyeOff, Shield } from "lucide-react";

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
      // Hard navigation so the new Set-Cookie is sent on the next document request
      window.location.href = safeNextPath();
    } catch {
      setError("Network error — try again");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#F4F5F7] px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_50%_0%,rgba(109,40,217,0.12),transparent)]"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-8 shadow-xl shadow-violet-900/5">
        <div className="mb-6 text-center">
          <Link href="/" className="mb-4 inline-flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/bygate-logo.png"
              alt="Bygate"
              width={36}
              height={36}
              className="h-9 w-9 rounded-xl object-cover shadow-sm ring-1 ring-black/5"
            />
            <span className="text-[17px] font-semibold tracking-tight text-gray-900">Bygate</span>
          </Link>
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-800">
            <Shield className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Admin access</h1>
          <p className="mt-1 text-sm text-gray-500">Operations console for Bygate WhatsApp + web</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="admin-email" className="block text-sm font-medium text-gray-700">
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
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none ring-violet-600/20 focus:border-violet-500 focus:ring-4"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="admin-password" className="block text-sm font-medium text-gray-700">
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
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 pr-11 text-sm outline-none ring-violet-600/20 focus:border-violet-500 focus:ring-4"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error ? (
            <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="inline-flex w-full items-center justify-center rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in to admin"}
          </button>
        </form>
      </div>
    </div>
  );
}
