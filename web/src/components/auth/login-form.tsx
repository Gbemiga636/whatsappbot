"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { WhatsAppCTA } from "@/components/shared/whatsapp-cta";

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await login(phone, password);
    setLoading(false);
    if (!res.ok) {
      setError(res.message || "Login failed");
      return;
    }
    toast.success("Welcome back — wallet synced");
    router.push("/dashboard");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="phone">WhatsApp number</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0803 000 0000"
        />
        <p className="text-xs text-gray-500">Same number you use on WhatsApp.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="pr-11"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" loading={loading}>
        Log in
      </Button>

      <div className="relative py-2 text-center text-xs text-gray-400">
        <span className="relative z-10 bg-white px-2">or</span>
        <span className="absolute inset-x-0 top-1/2 h-px bg-gray-100" />
      </div>

      <WhatsAppCTA className="w-full" label="Continue on WhatsApp" />

      <p className="text-center text-sm text-gray-500">
        No account?{" "}
        <Link href="/signup" className="font-medium text-violet-700 hover:underline">
          Sign up
        </Link>
        {" · "}
        <Link href="/signup?mode=guest" className="font-medium text-violet-700 hover:underline">
          Guest
        </Link>
      </p>
    </form>
  );
}
