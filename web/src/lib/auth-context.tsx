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
};

type AuthContextValue = {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  signup: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  continueAsGuest: (name?: string) => Promise<void>;
  logout: () => void;
  refreshWallet: () => void;
};

const STORAGE_KEY = "bygate_web_auth_v1";

const AuthContext = createContext<AuthContextValue | null>(null);

function readStored(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

function writeStored(user: UserProfile | null) {
  if (typeof window === "undefined") return;
  if (!user) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(readStored());
    setLoading(false);
  }, []);

  const persist = useCallback((next: UserProfile | null) => {
    setUser(next);
    writeStored(next);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await new Promise((r) => setTimeout(r, 700));
    if (!email || password.length < 6) {
      return { ok: false, message: "Invalid email or password." };
    }
    const profile: UserProfile = {
      id: `usr_${Date.now()}`,
      email: email.trim().toLowerCase(),
      firstName: email.split("@")[0] || "User",
      mode: "authenticated",
      walletBalance: 12500,
    };
    persist(profile);
    return { ok: true };
  }, [persist]);

  const signup = useCallback(
    async (data: { firstName: string; lastName: string; email: string; password: string }) => {
      await new Promise((r) => setTimeout(r, 900));
      if (data.password.length < 6) {
        return { ok: false, message: "Password must be at least 6 characters." };
      }
      const profile: UserProfile = {
        id: `usr_${Date.now()}`,
        email: data.email.trim().toLowerCase(),
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        mode: "authenticated",
        walletBalance: 0,
      };
      persist(profile);
      return { ok: true };
    },
    [persist]
  );

  const continueAsGuest = useCallback(
    async (name?: string) => {
      await new Promise((r) => setTimeout(r, 400));
      persist({
        id: `guest_${Date.now()}`,
        firstName: name?.trim() || "Guest",
        mode: "guest",
        walletBalance: 0,
      });
    },
    [persist]
  );

  const logout = useCallback(() => persist(null), [persist]);

  const refreshWallet = useCallback(() => {
    setUser((prev) => {
      if (!prev || prev.mode !== "authenticated") return prev;
      const next = { ...prev, walletBalance: prev.walletBalance };
      writeStored(next);
      return next;
    });
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
