"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AuthMode = "authenticated" | "guest" | null;

export type UserProfile = {
  id: string;
  email?: string;
  firstName: string;
  lastName?: string;
  phone?: string;
  mode: AuthMode;
  walletBalance: number;
  live?: boolean;
};

type AuthContextValue = {
  user: UserProfile | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  signup: (data: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    password: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  continueAsGuest: (name?: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshWallet: () => Promise<void>;
};

const STORAGE_KEY = "bygate_web_auth_v2";

const AuthContext = createContext<AuthContextValue | null>(null);

function mapApiUser(u: {
  phone: string;
  email?: string | null;
  firstName: string;
  lastName?: string;
  authMode: string;
  walletBalance: number;
  supabaseUserId?: string | null;
}): UserProfile {
  return {
    id: u.supabaseUserId || u.phone,
    email: u.email || undefined,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    mode: u.authMode === "authenticated" ? "authenticated" : "guest",
    walletBalance: Number(u.walletBalance || 0),
    live: true,
  };
}

function readGuest(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

function writeGuest(user: UserProfile | null) {
  if (typeof window === "undefined") return;
  if (!user) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWallet = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.user) {
          const mapped = mapApiUser(data.user);
          setUser(mapped);
          writeGuest(null);
          return;
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "same-origin" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data.ok && data.user) {
            setUser(mapApiUser(data.user));
            writeGuest(null);
            setLoading(false);
            return;
          }
        }
      } catch {
        /* fall through to guest cache */
      }
      if (!cancelled) {
        setUser(readGuest());
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        return { ok: false, message: data.message || "Login failed" };
      }
      setUser(mapApiUser(data.user));
      writeGuest(null);
      return { ok: true };
    } catch {
      return { ok: false, message: "Network error" };
    }
  }, []);

  const signup = useCallback(
    async (data: {
      firstName: string;
      lastName: string;
      phone: string;
      email: string;
      password: string;
    }) => {
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(data),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) {
          return { ok: false, message: json.message || "Signup failed" };
        }
        setUser(mapApiUser(json.user));
        writeGuest(null);
        return { ok: true };
      } catch {
        return { ok: false, message: "Network error" };
      }
    },
    []
  );

  const continueAsGuest = useCallback(async (name?: string, phone?: string) => {
    const profile: UserProfile = {
      id: `guest_${Date.now()}`,
      firstName: name?.trim() || "Guest",
      phone: phone || undefined,
      mode: "guest",
      walletBalance: 0,
      live: false,
    };
    writeGuest(profile);
    setUser(profile);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {
      /* ignore */
    }
    writeGuest(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, continueAsGuest, logout, refreshWallet }),
    [user, loading, login, signup, continueAsGuest, logout, refreshWallet]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
