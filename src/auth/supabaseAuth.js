/**
 * Supabase Auth — signup, login, phone linking for WhatsApp users.
 */

const { getSupabase, isSupabaseReady } = require('../db/supabase');
const { setUser, getUser } = require('../userStore');
const logger = require('../core/logger');

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('234') ? digits : digits.startsWith('0') ? `234${digits.slice(1)}` : digits;
}

async function linkWhatsAppProfile(phone, authUser, extra = {}) {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Database not configured' };

  const meta = authUser.user_metadata || {};
  const row = {
    phone,
    email: authUser.email,
    first_name: extra.firstName || meta.first_name || meta.firstName || '',
    last_name: extra.lastName || meta.last_name || meta.lastName || '',
    auth_mode: 'authenticated',
    supabase_user_id: authUser.id,
    mysogi_token: extra.mysogiToken || null,
    mysogi_user_id: extra.userId || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('whatsapp_users')
    .upsert(row, { onConflict: 'phone' })
    .select()
    .single();

  if (error) {
    logger.error('linkWhatsAppProfile failed', { phone, error: error.message });
    return { ok: false, message: error.message };
  }

  setUser(phone, {
    email: data.email,
    firstName: data.first_name,
    lastName: data.last_name,
    authMode: 'authenticated',
    supabaseUserId: data.supabase_user_id,
    mysogiToken: data.mysogi_token,
    userId: data.mysogi_user_id,
    walletBalance: data.wallet_balance,
    kycLevel: data.kyc_level,
  });

  return { ok: true, user: data };
}

async function restoreUserByPhone(phone) {
  const db = getSupabase();
  if (!db) return getUser(phone);

  const { data, error } = await db
    .from('whatsapp_users')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error || !data) return getUser(phone);

  if (data.auth_mode === 'authenticated' && data.email) {
    setUser(phone, {
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      authMode: 'authenticated',
      supabaseUserId: data.supabase_user_id,
      mysogiToken: data.mysogi_token,
      userId: data.mysogi_user_id,
      walletBalance: data.wallet_balance,
      kycLevel: data.kyc_level,
    });
  }

  return getUser(phone);
}

async function signUp({ phone, email, password, firstName, lastName }) {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Supabase not configured' };

  if (!isValidEmail(email)) return { ok: false, message: 'Invalid email address' };
  if (!password || password.length < 6) return { ok: false, message: 'Password must be at least 6 characters' };

  const { data, error } = await db.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      phone: formatPhone(phone),
      source: 'whatsapp',
    },
  });

  if (error) {
    const msg = error.message.includes('already')
      ? 'This email is already registered. Type *login* instead.'
      : error.message;
    return { ok: false, message: msg };
  }

  const linked = await linkWhatsAppProfile(phone, data.user, { firstName, lastName });
  if (!linked.ok) return { ok: false, message: linked.message };

  return {
    ok: true,
    user: {
      email: data.user.email,
      firstName,
      lastName,
      id: data.user.id,
    },
    message: 'Account created successfully',
  };
}

async function signIn({ phone, email, password }) {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Supabase not configured' };

  if (!isValidEmail(email)) return { ok: false, message: 'Invalid email address' };

  const { data, error } = await db.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    return { ok: false, message: error.message === 'Invalid login credentials'
      ? 'Wrong email or password. Try again or type *signup*.'
      : error.message };
  }

  const linked = await linkWhatsAppProfile(phone, data.user);
  if (!linked.ok) return { ok: false, message: linked.message };

  return {
    ok: true,
    user: {
      email: data.user.email,
      firstName: linked.user?.first_name,
      lastName: linked.user?.last_name,
      id: data.user.id,
    },
    message: 'Logged in successfully',
  };
}

async function sendEmailOtp(email) {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Supabase not configured' };

  const { error } = await db.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, email: email.trim().toLowerCase() };
}

async function verifyEmailOtp({ phone, email, token }) {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Supabase not configured' };

  const { data, error } = await db.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.replace(/\s/g, ''),
    type: 'email',
  });

  if (error) return { ok: false, message: 'Invalid or expired code. Type *login* to try again.' };

  const linked = await linkWhatsAppProfile(phone, data.user);
  if (!linked.ok) return { ok: false, message: linked.message };

  return { ok: true, user: data.user, message: 'Logged in successfully' };
}

async function signOut(phone) {
  const db = getSupabase();
  if (db) {
    await db
      .from('whatsapp_users')
      .update({ auth_mode: 'guest', updated_at: new Date().toISOString() })
      .eq('phone', phone);
  }

  setUser(phone, {
    authMode: 'guest',
    email: null,
    firstName: null,
    lastName: null,
    supabaseUserId: null,
    mysogiToken: null,
    userId: null,
  });

  return { ok: true };
}

async function checkDatabase() {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Not configured' };

  const { error } = await db.from('whatsapp_users').select('phone').limit(1);
  if (error) {
    return {
      ok: false,
      message: error.message,
      hint: 'Run supabase/migrations/001_initial_schema.sql in Supabase SQL Editor',
    };
  }
  return { ok: true };
}

module.exports = {
  isSupabaseReady,
  isValidEmail,
  signUp,
  signIn,
  sendEmailOtp,
  verifyEmailOtp,
  signOut,
  linkWhatsAppProfile,
  restoreUserByPhone,
  checkDatabase,
  formatPhone,
};
