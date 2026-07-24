"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { WhatsAppCTA } from "@/components/shared/whatsapp-cta";
import { cn } from "@/lib/utils";

function strength(password: string) {
  let score = 0;
  if (password.length >= 6) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;
  return score;
}

export function SignupForm() {
  const { signup, continueAsGuest } = useAuth();
  const router = useRouter();
  const [guestMode, setGuestMode] = useState(false);

  useEffect(() => {
    try {
      setGuestMode(new URLSearchParams(window.location.search).get("mode") === "guest");
    } catch {
      setGuestMode(false);
    }
  }, []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const score = useMemo(() => strength(password), [password]);
  const labels = ["Too short", "Weak", "Okay", "Good", "Strong"];

  async function onGuest() {
    setLoading(true);
    await continueAsGuest(firstName || "Guest", phone || undefined);
    setLoading(false);
    toast.success("You're in as guest — create an account with your number to sync WhatsApp");
    router.push("/dashboard");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (guestMode) {
      await onGuest();
      return;
    }
    setError("");
    setLoading(true);
    const res = await signup({ firstName, lastName, phone, email, password });
    setLoading(false);
    if (!res.ok) {
      setError(res.message || "Signup failed");
      return;
    }
    toast.success("Account created — synced to your WhatsApp number");
    router.push("/dashboard");
  }

  if (guestMode) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 text-sm text-violet-900">
          Guest mode explores the dashboard. For a synced wallet, sign up with the same number you
          use on WhatsApp.
        </div>
        <div className="space-y-2">
          <Label htmlFor="guest-name">Display name (optional)</Label>
          <Input
            id="guest-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Ada"
          />
        </div>
        <Button className="w-full" loading={loading} onClick={onGuest}>
          Continue as guest
        </Button>
        <WhatsAppCTA className="w-full" label="Or start on WhatsApp" />
        <p className="text-center text-sm text-gray-500">
          Want a wallet?{" "}
          <Link href="/signup" className="font-medium text-violet-700 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Ada"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Okafor"
          />
        </div>
      </div>

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
        <p className="text-xs text-gray-500">
          Use the same number as WhatsApp so your wallet and history stay in sync.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
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
        {password && (
          <div className="space-y-1.5 pt-1">
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full",
                    i < score ? "bg-violet-600" : "bg-gray-200"
                  )}
                />
              ))}
            </div>
            <p className="text-xs text-gray-500">{labels[score]}</p>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" loading={loading}>
        Create account
      </Button>

      <Button type="button" variant="outline" className="w-full" onClick={onGuest} disabled={loading}>
        Continue as guest
      </Button>

      <WhatsAppCTA className="w-full" label="Prefer WhatsApp?" />

      <p className="text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-violet-700 hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
