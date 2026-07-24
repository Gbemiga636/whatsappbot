import { getAdminSupabase, isAdminDbReady } from "./supabase";
import {
  demoOverview,
  demoReminders,
  demoSessions,
  demoTransactions,
  demoUsers,
  type AdminReminder,
  type AdminSession,
  type AdminTransaction,
  type AdminUser,
  type OverviewStats,
} from "./demo-data";

function mapUser(row: Record<string, unknown>): AdminUser {
  return {
    id: String(row.id),
    phone: String(row.phone || ""),
    email: (row.email as string) || null,
    firstName: (row.first_name as string) || null,
    lastName: (row.last_name as string) || null,
    authMode: String(row.auth_mode || "guest"),
    walletBalance: Number(row.wallet_balance || 0),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function mapTx(row: Record<string, unknown>): AdminTransaction {
  return {
    id: String(row.id),
    phone: String(row.phone || ""),
    service: String(row.service || ""),
    type: String(row.type || ""),
    amount: Number(row.amount || 0),
    status: String(row.status || ""),
    reference: (row.reference as string) || null,
    provider: (row.provider as string) || null,
    createdAt: String(row.created_at || ""),
    metadata: (row.metadata as Record<string, unknown>) || undefined,
  };
}

function mapReminder(row: Record<string, unknown>): AdminReminder {
  return {
    id: String(row.id),
    phone: String(row.phone || ""),
    title: String(row.title || ""),
    remindAt: String(row.remind_at || ""),
    frequency: String(row.frequency || "once"),
    enabled: row.enabled !== false,
    lastSentAt: (row.last_sent_at as string) || null,
  };
}

function mapSession(row: Record<string, unknown>): AdminSession {
  return {
    phone: String(row.phone || ""),
    step: String(row.step || "idle"),
    activeService: (row.active_service as string) || null,
    updatedAt: String(row.updated_at || ""),
    data: (row.data as Record<string, unknown>) || undefined,
  };
}

export async function fetchOverview(): Promise<OverviewStats> {
  const db = getAdminSupabase();
  if (!db) return demoOverview();

  try {
    const [
      usersRes,
      guestRes,
      authRes,
      txAll,
      txDone,
      txPending,
      txFailed,
      paystackRes,
      opayRes,
      remRes,
      dueRes,
      sessRes,
      walletRes,
    ] = await Promise.all([
      db.from("whatsapp_users").select("*", { count: "exact", head: true }),
      db.from("whatsapp_users").select("*", { count: "exact", head: true }).eq("auth_mode", "guest"),
      db
        .from("whatsapp_users")
        .select("*", { count: "exact", head: true })
        .eq("auth_mode", "authenticated"),
      db.from("transactions").select("*", { count: "exact", head: true }),
      db.from("transactions").select("*", { count: "exact", head: true }).eq("status", "completed"),
      db.from("transactions").select("*", { count: "exact", head: true }).eq("status", "pending"),
      db.from("transactions").select("*", { count: "exact", head: true }).eq("status", "failed"),
      db
        .from("transactions")
        .select("amount")
        .eq("status", "completed")
        .eq("provider", "paystack")
        .in("type", ["topup", "topup_gift", "guest_purchase"]),
      db
        .from("transactions")
        .select("amount")
        .eq("status", "completed")
        .eq("provider", "opay")
        .in("type", ["topup", "topup_gift", "guest_purchase"]),
      db.from("reminders").select("*", { count: "exact", head: true }).eq("enabled", true),
      db
        .from("reminders")
        .select("*", { count: "exact", head: true })
        .eq("enabled", true)
        .lte("remind_at", new Date(Date.now() + 24 * 3600_000).toISOString()),
      db.from("bot_sessions").select("*", { count: "exact", head: true }),
      db.from("whatsapp_users").select("wallet_balance"),
    ]);

    const paystackIn = (paystackRes.data || []).reduce(
      (s, r) => s + Number((r as { amount?: number }).amount || 0),
      0
    );
    const opayIn = (opayRes.data || []).reduce(
      (s, r) => s + Number((r as { amount?: number }).amount || 0),
      0
    );
    const walletFloat = (walletRes.data || []).reduce(
      (s, r) => s + Number((r as { wallet_balance?: number }).wallet_balance || 0),
      0
    );

    return {
      usersTotal: usersRes.count || 0,
      usersGuest: guestRes.count || 0,
      usersAuth: authRes.count || 0,
      walletFloat,
      txTotal: txAll.count || 0,
      txCompleted: txDone.count || 0,
      txPending: txPending.count || 0,
      txFailed: txFailed.count || 0,
      paystackIn,
      opayIn,
      remindersActive: remRes.count || 0,
      remindersDueSoon: dueRes.count || 0,
      liveSessions: sessRes.count || 0,
      source: "live",
    };
  } catch {
    return demoOverview();
  }
}

export async function fetchUsers(limit = 100): Promise<{ rows: AdminUser[]; live: boolean }> {
  const db = getAdminSupabase();
  if (!db) return { rows: demoUsers(), live: false };
  try {
    const { data, error } = await db
      .from("whatsapp_users")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { rows: (data || []).map((r) => mapUser(r as Record<string, unknown>)), live: true };
  } catch {
    return { rows: demoUsers(), live: false };
  }
}

/**
 * Admin wallet edit — set absolute balance or adjust by delta.
 * Writes ledger + transaction when live DB is available.
 */
export async function updateUserWallet(opts: {
  phone: string;
  mode: "set" | "adjust";
  amount: number;
  reason?: string;
}): Promise<{ ok: boolean; message: string; balance?: number }> {
  const db = getAdminSupabase();
  if (!db) {
    return { ok: false, message: "Database not configured (SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const phone = String(opts.phone || "").replace(/\D/g, "");
  if (!phone) return { ok: false, message: "Phone is required." };

  const amount = Number(opts.amount);
  if (!Number.isFinite(amount)) return { ok: false, message: "Invalid amount." };
  if (opts.mode === "set" && amount < 0) return { ok: false, message: "Balance cannot be negative." };
  if (opts.mode === "adjust" && amount === 0) {
    return { ok: false, message: "Adjustment must be non-zero." };
  }

  const { data: row, error: readErr } = await db
    .from("whatsapp_users")
    .select("phone, wallet_balance, metadata")
    .eq("phone", phone)
    .maybeSingle();

  if (readErr) return { ok: false, message: readErr.message };
  if (!row) return { ok: false, message: "User not found." };

  const current = Number(row.wallet_balance || 0);
  const next =
    opts.mode === "set" ? amount : Math.round((current + amount) * 100) / 100;

  if (next < 0) return { ok: false, message: "Resulting balance would be negative." };

  const delta = Math.round((next - current) * 100) / 100;
  const reason = (opts.reason || "Admin balance update").slice(0, 200);
  const reference = `ADM_${Date.now()}_${phone.slice(-4)}`;

  const { error: updErr } = await db
    .from("whatsapp_users")
    .update({
      wallet_balance: next,
      updated_at: new Date().toISOString(),
      metadata: {
        ...((row.metadata as Record<string, unknown>) || {}),
        last_admin_balance_edit: {
          at: new Date().toISOString(),
          from: current,
          to: next,
          reason,
        },
      },
    })
    .eq("phone", phone);

  if (updErr) return { ok: false, message: updErr.message };

  // Best-effort audit trail
  try {
    await db.from("wallet_ledger").insert({
      phone,
      amount: delta,
      balance_after: next,
      type: delta >= 0 ? "credit" : "debit",
      reference,
      service: "admin",
      metadata: { reason, admin: true, mode: opts.mode },
      created_at: new Date().toISOString(),
    });
  } catch {
    /* ledger table may differ — ignore */
  }

  try {
    await db.from("transactions").insert({
      phone,
      service: "admin",
      type: "admin_balance",
      amount: Math.abs(delta),
      status: "completed",
      reference,
      provider: "admin",
      metadata: {
        reason,
        mode: opts.mode,
        from: current,
        to: next,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* ignore */
  }

  return { ok: true, message: "Balance updated", balance: next };
}

export async function fetchTransactions(limit = 150): Promise<{
  rows: AdminTransaction[];
  live: boolean;
}> {
  const db = getAdminSupabase();
  if (!db) return { rows: demoTransactions(), live: false };
  try {
    const { data, error } = await db
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { rows: (data || []).map((r) => mapTx(r as Record<string, unknown>)), live: true };
  } catch {
    return { rows: demoTransactions(), live: false };
  }
}

export async function fetchReminders(limit = 200): Promise<{
  rows: AdminReminder[];
  live: boolean;
}> {
  const db = getAdminSupabase();
  if (!db) return { rows: demoReminders(), live: false };
  try {
    const { data, error } = await db
      .from("reminders")
      .select("*")
      .order("remind_at", { ascending: true })
      .limit(limit);
    if (error) throw error;
    return { rows: (data || []).map((r) => mapReminder(r as Record<string, unknown>)), live: true };
  } catch {
    return { rows: demoReminders(), live: false };
  }
}

export async function fetchSessions(limit = 100): Promise<{
  rows: AdminSession[];
  live: boolean;
}> {
  const db = getAdminSupabase();
  if (!db) return { rows: demoSessions(), live: false };
  try {
    const { data, error } = await db
      .from("bot_sessions")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return { rows: (data || []).map((r) => mapSession(r as Record<string, unknown>)), live: true };
  } catch {
    return { rows: demoSessions(), live: false };
  }
}

export async function fetchClubKonnectBalance(): Promise<{
  ok: boolean;
  balance: number | null;
  message: string;
}> {
  const userId = process.env.CLUBKONNECT_USER_ID || "";
  const apiKey = process.env.CLUBKONNECT_API_KEY || "";
  if (!userId || !apiKey) {
    return {
      ok: false,
      balance: null,
      message: "Add CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY to web/.env.local",
    };
  }

  try {
    const url = `https://www.nellobytesystems.com/APIWalletBalanceV1.asp?UserID=${encodeURIComponent(
      userId
    )}&APIKey=${encodeURIComponent(apiKey)}&json=true`;
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as { balance?: string | number; status?: string };
    const balance = Number(String(data.balance ?? "").replace(/,/g, ""));
    if (!Number.isFinite(balance)) {
      return { ok: false, balance: null, message: "Could not parse ClubKonnect balance" };
    }
    return { ok: true, balance, message: "Live ClubKonnect wallet" };
  } catch (err) {
    return {
      ok: false,
      balance: null,
      message: err instanceof Error ? err.message : "ClubKonnect request failed",
    };
  }
}

export { isAdminDbReady };
