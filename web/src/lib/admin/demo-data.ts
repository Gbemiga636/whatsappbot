import { formatNaira } from "@/lib/utils";

export function money(n: number) {
  return formatNaira(n || 0);
}

export type AdminUser = {
  id: string;
  phone: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  authMode: string;
  walletBalance: number;
  createdAt: string;
  updatedAt: string;
};

export type AdminTransaction = {
  id: string;
  phone: string;
  service: string;
  type: string;
  amount: number;
  status: string;
  reference: string | null;
  provider: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type AdminReminder = {
  id: string;
  phone: string;
  title: string;
  remindAt: string;
  frequency: string;
  enabled: boolean;
  lastSentAt: string | null;
};

export type AdminSession = {
  phone: string;
  step: string;
  activeService: string | null;
  updatedAt: string;
  data?: Record<string, unknown>;
};

export type OverviewStats = {
  usersTotal: number;
  usersGuest: number;
  usersAuth: number;
  walletFloat: number;
  txTotal: number;
  txCompleted: number;
  txPending: number;
  txFailed: number;
  paystackIn: number;
  opayIn: number;
  remindersActive: number;
  remindersDueSoon: number;
  liveSessions: number;
  source: "live" | "demo";
};

/** Demo dataset so the panel is useful before Supabase is wired */
export function demoOverview(): OverviewStats {
  return {
    usersTotal: 1284,
    usersGuest: 412,
    usersAuth: 872,
    walletFloat: 4_285_600,
    txTotal: 18_420,
    txCompleted: 16_902,
    txPending: 88,
    txFailed: 430,
    paystackIn: 12_450_000,
    opayIn: 2_180_000,
    remindersActive: 356,
    remindersDueSoon: 24,
    liveSessions: 47,
    source: "demo",
  };
}

export function demoUsers(): AdminUser[] {
  return [
    {
      id: "1",
      phone: "2348012345678",
      email: "ada@email.com",
      firstName: "Ada",
      lastName: "Okafor",
      authMode: "authenticated",
      walletBalance: 12500,
      createdAt: "2026-06-01T10:00:00Z",
      updatedAt: "2026-07-22T18:00:00Z",
    },
    {
      id: "2",
      phone: "2348098765432",
      email: null,
      firstName: "Guest",
      lastName: null,
      authMode: "guest",
      walletBalance: 0,
      createdAt: "2026-07-20T08:00:00Z",
      updatedAt: "2026-07-23T07:00:00Z",
    },
    {
      id: "3",
      phone: "2347011122233",
      email: "tunde@email.com",
      firstName: "Tunde",
      lastName: "Bakare",
      authMode: "authenticated",
      walletBalance: 4800,
      createdAt: "2026-05-12T12:00:00Z",
      updatedAt: "2026-07-21T14:00:00Z",
    },
  ];
}

export function demoTransactions(): AdminTransaction[] {
  return [
    {
      id: "t1",
      phone: "2348012345678",
      service: "airtime",
      type: "purchase",
      amount: 500,
      status: "completed",
      reference: "TX_MTN_001",
      provider: "clubkonnect",
      createdAt: "2026-07-23T06:40:00Z",
    },
    {
      id: "t2",
      phone: "2348012345678",
      service: "wallet",
      type: "topup",
      amount: 5000,
      status: "completed",
      reference: "TOPUP_001",
      provider: "paystack",
      createdAt: "2026-07-23T06:35:00Z",
    },
    {
      id: "t3",
      phone: "2348098765432",
      service: "bills",
      type: "guest_purchase",
      amount: 3500,
      status: "pending",
      reference: "GST_001",
      provider: "opay",
      createdAt: "2026-07-23T07:10:00Z",
    },
    {
      id: "t4",
      phone: "2347011122233",
      service: "airtime",
      type: "purchase",
      amount: 2000,
      status: "failed",
      reference: "TX_GLO_009",
      provider: "clubkonnect",
      createdAt: "2026-07-22T19:00:00Z",
    },
  ];
}

export function demoReminders(): AdminReminder[] {
  return [
    {
      id: "r1",
      phone: "2348012345678",
      title: "Drink water",
      remindAt: "2026-07-23T19:45:00Z",
      frequency: "daily",
      enabled: true,
      lastSentAt: null,
    },
    {
      id: "r2",
      phone: "2347011122233",
      title: "Pay rent",
      remindAt: "2026-07-28T09:00:00Z",
      frequency: "once",
      enabled: true,
      lastSentAt: null,
    },
  ];
}

export function demoSessions(): AdminSession[] {
  return [
    {
      phone: "2348012345678",
      step: "airtime_confirm",
      activeService: "airtime",
      updatedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    },
    {
      phone: "2348098765432",
      step: "super_menu",
      activeService: null,
      updatedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    },
    {
      phone: "2347011122233",
      step: "wallet_menu",
      activeService: "wallet",
      updatedAt: new Date(Date.now() - 30_000).toISOString(),
    },
  ];
}
