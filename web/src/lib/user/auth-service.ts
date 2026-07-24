import { getAdminSupabase } from "@/lib/admin/supabase";
import { isValidNgPhone, normalizePhone } from "@/lib/phone";

export type UserRow = {
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string;
  authMode: "authenticated" | "guest";
  walletBalance: number;
  supabaseUserId: string | null;
};

function mapRow(data: Record<string, unknown>): UserRow {
  return {
    phone: String(data.phone || ""),
    email: (data.email as string) || null,
    firstName: String(data.first_name || "User"),
    lastName: String(data.last_name || ""),
    authMode: data.auth_mode === "authenticated" ? "authenticated" : "guest",
    walletBalance: Number(data.wallet_balance || 0),
    supabaseUserId: (data.supabase_user_id as string) || null,
  };
}

async function linkWhatsAppProfile(
  phone: string,
  authUser: { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
  extra: { firstName?: string; lastName?: string } = {}
) {
  const db = getAdminSupabase();
  if (!db) return { ok: false as const, message: "Database not configured" };

  const normalizedPhone = normalizePhone(phone);
  const meta = authUser.user_metadata || {};
  const { data: existingRow } = await db
    .from("whatsapp_users")
    .select("metadata, wallet_balance")
    .eq("phone", normalizedPhone)
    .maybeSingle();

  const row = {
    phone: normalizedPhone,
    email: authUser.email,
    first_name: extra.firstName || meta.first_name || meta.firstName || "",
    last_name: extra.lastName || meta.last_name || meta.lastName || "",
    auth_mode: "authenticated",
    supabase_user_id: authUser.id,
    metadata: (existingRow?.metadata as Record<string, unknown>) || {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from("whatsapp_users")
    .upsert(row, { onConflict: "phone" })
    .select("*")
    .single();

  if (error) return { ok: false as const, message: error.message };
  return { ok: true as const, user: mapRow(data as Record<string, unknown>) };
}

export async function signupWithPhone(input: {
  phone: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}) {
  const db = getAdminSupabase();
  if (!db) {
    return {
      ok: false as const,
      message: "Server not configured. Add SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const phone = normalizePhone(input.phone);
  if (!isValidNgPhone(phone)) {
    return { ok: false as const, message: "Enter a valid Nigerian phone (e.g. 0803…)." };
  }

  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (firstName.length < 2 || lastName.length < 2) {
    return { ok: false as const, message: "First and last name must be at least 2 characters." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false as const, message: "Invalid email address." };
  }
  if (!input.password || input.password.length < 6) {
    return { ok: false as const, message: "Password must be at least 6 characters." };
  }

  const { data: existing } = await db
    .from("whatsapp_users")
    .select("phone, auth_mode, email")
    .eq("phone", phone)
    .maybeSingle();

  if (existing?.auth_mode === "authenticated" && existing.email) {
    return {
      ok: false as const,
      message: "This WhatsApp number already has an account. Log in instead.",
    };
  }

  const { data, error } = await db.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      phone,
      source: "web",
    },
  });

  if (error) {
    const msg = /already|registered|exists/i.test(error.message)
      ? "This email is already registered. Log in instead."
      : error.message;
    return { ok: false as const, message: msg };
  }

  const linked = await linkWhatsAppProfile(phone, data.user!, { firstName, lastName });
  if (!linked.ok) return linked;

  return { ok: true as const, user: linked.user };
}

export async function loginWithPhone(input: { phone: string; password: string }) {
  const db = getAdminSupabase();
  if (!db) {
    return {
      ok: false as const,
      message: "Server not configured. Add SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const phone = normalizePhone(input.phone);
  if (!isValidNgPhone(phone)) {
    return { ok: false as const, message: "Enter a valid Nigerian phone (e.g. 0803…)." };
  }

  const { data: row, error: lookupErr } = await db
    .from("whatsapp_users")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  if (lookupErr) return { ok: false as const, message: lookupErr.message };
  if (!row?.email) {
    return {
      ok: false as const,
      message: "No account for this number. Sign up with the same WhatsApp number.",
    };
  }

  const { data, error } = await db.auth.signInWithPassword({
    email: String(row.email).toLowerCase(),
    password: input.password,
  });

  if (error) {
    return {
      ok: false as const,
      message:
        error.message === "Invalid login credentials"
          ? "Wrong phone or password."
          : error.message,
    };
  }

  const linked = await linkWhatsAppProfile(phone, data.user!);
  if (!linked.ok) return linked;

  return { ok: true as const, user: linked.user };
}

export async function getUserByPhone(phone: string) {
  const db = getAdminSupabase();
  if (!db) return null;
  const normalized = normalizePhone(phone);
  const { data, error } = await db
    .from("whatsapp_users")
    .select("*")
    .eq("phone", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function getActivityForPhone(phone: string, limit = 40) {
  const db = getAdminSupabase();
  if (!db) return { live: false, rows: [] as ActivityRow[] };
  const normalized = normalizePhone(phone);
  const { data, error } = await db
    .from("transactions")
    .select("id, phone, service, type, amount, status, provider, reference, created_at")
    .eq("phone", normalized)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { live: false, rows: [] as ActivityRow[] };
  return {
    live: true,
    rows: (data || []).map((t) => ({
      id: String(t.id || t.reference || Math.random()),
      title: `${t.service || "tx"} · ${t.type || ""}`.trim(),
      amount: Number(t.amount || 0),
      status: String(t.status || "unknown"),
      provider: (t.provider as string) || null,
      date: t.created_at
        ? new Date(t.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })
        : "—",
      createdAt: String(t.created_at || ""),
    })),
  };
}

export type ActivityRow = {
  id: string;
  title: string;
  amount: number;
  status: string;
  provider: string | null;
  date: string;
  createdAt: string;
};
