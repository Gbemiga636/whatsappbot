/**
 * Supabase Auth — signup, login, phone linking for WhatsApp users.
 */

const { getSupabase, isSupabaseReady } = require('../db/supabase');
const { setUser, getUser } = require('../userStore');
const logger = require('../core/logger');
const config = require('../config');
const wallet = require('../wallet/walletService');

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

function normalizePhone(phone) {
  return wallet.normalizePhone(phone) || String(phone || '').replace(/\D/g, '');
}

function formatPhone(phone) {
  return normalizePhone(phone);
}

function hasServiceRoleKey() {
  return !!config.supabase?.serviceRoleKey;
}

function isValidName(name) {
  return String(name || '').trim().length >= 2;
}

async function linkWhatsAppProfile(phone, authUser, extra = {}) {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Database not configured' };

  const normalizedPhone = normalizePhone(phone);
  const meta = authUser.user_metadata || {};
  const { data: existingRow } = await db
    .from('whatsapp_users')
    .select('metadata, wallet_balance')
    .eq('phone', normalizedPhone)
    .maybeSingle();

  const row = {
    phone: normalizedPhone,
    email: authUser.email,
    first_name: extra.firstName || meta.first_name || meta.firstName || '',
    last_name: extra.lastName || meta.last_name || meta.lastName || '',
    auth_mode: 'authenticated',
    supabase_user_id: authUser.id,
    mysogi_token: extra.mysogiToken || null,
    mysogi_user_id: extra.userId || null,
    metadata: existingRow?.metadata || {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db
    .from('whatsapp_users')
    .upsert(row, { onConflict: 'phone' })
    .select()
    .single();

  if (error) {
    logger.error('linkWhatsAppProfile failed', { phone: normalizedPhone, error: error.message });
    return { ok: false, message: error.message };
  }

  setUser(normalizedPhone, {
    email: data.email,
    firstName: data.first_name,
    lastName: data.last_name,
    authMode: 'authenticated',
    supabaseUserId: data.supabase_user_id,
    mysogiToken: data.mysogi_token,
    userId: data.mysogi_user_id,
    walletBalance: data.wallet_balance,
    kycLevel: data.kyc_level,
    metadata: data.metadata || {},
  });

  return { ok: true, user: data };
}

async function restoreUserByPhone(phone) {
  const db = getSupabase();
  const normalizedPhone = normalizePhone(phone);
  if (!db) return getUser(normalizedPhone);

  const { data, error } = await db
    .from('whatsapp_users')
    .select('*')
    .eq('phone', normalizedPhone)
    .maybeSingle();

  if (error || !data) return getUser(normalizedPhone);

  const patch = {
    metadata: data.metadata || {},
    walletBalance: data.wallet_balance,
    kycLevel: data.kyc_level,
  };

  if (data.auth_mode === 'authenticated' && data.email) {
    Object.assign(patch, {
      email: data.email,
      firstName: data.first_name,
      lastName: data.last_name,
      authMode: 'authenticated',
      supabaseUserId: data.supabase_user_id,
      mysogiToken: data.mysogi_token,
      userId: data.mysogi_user_id,
    });
  }

  const current = getUser(normalizedPhone) || { phone: normalizedPhone };
  setUser(normalizedPhone, { ...current, ...patch });

  return getUser(normalizedPhone);
}

async function signUp({ phone, email, password, firstName, lastName }) {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Supabase not configured' };

  if (!hasServiceRoleKey()) {
    return {
      ok: false,
      message:
        'Signup is not configured on the server. Add SUPABASE_SERVICE_ROLE_KEY to your Netlify environment variables.',
    };
  }

  const normalizedPhone = normalizePhone(phone);
  const cleanEmail = email.trim().toLowerCase();
  const cleanFirst = String(firstName || '').trim();
  const cleanLast = String(lastName || '').trim();

  if (!isValidName(cleanFirst) || !isValidName(cleanLast)) {
    return { ok: false, message: 'First and last name must be at least 2 characters each.' };
  }
  if (!isValidEmail(cleanEmail)) return { ok: false, message: 'Invalid email address' };
  if (!password || password.length < 6) return { ok: false, message: 'Password must be at least 6 characters' };

  const { data, error } = await db.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: cleanFirst,
      last_name: cleanLast,
      phone: normalizedPhone,
      source: 'whatsapp',
    },
  });

  if (error) {
    const msg = /already|registered|exists/i.test(error.message)
      ? 'This email is already registered. Type *login* instead.'
      : error.message;
    return { ok: false, message: msg };
  }

  const linked = await linkWhatsAppProfile(normalizedPhone, data.user, {
    firstName: cleanFirst,
    lastName: cleanLast,
  });
  if (!linked.ok) return { ok: false, message: linked.message };

  return {
    ok: true,
    user: {
      email: data.user.email,
      firstName: cleanFirst,
      lastName: cleanLast,
      id: data.user.id,
    },
    message: 'Account created successfully',
  };
}

async function signIn({ phone, email, password }) {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Supabase not configured' };

  const normalizedPhone = normalizePhone(phone);
  const cleanEmail = email.trim().toLowerCase();

  if (!isValidEmail(cleanEmail)) return { ok: false, message: 'Invalid email address' };

  const { data, error } = await db.auth.signInWithPassword({
    email: cleanEmail,
    password,
  });

  if (error) {
    return {
      ok: false,
      message:
        error.message === 'Invalid login credentials'
          ? 'Wrong email or password. Try again or type *signup*.'
          : error.message,
    };
  }

  const linked = await linkWhatsAppProfile(normalizedPhone, data.user);
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

  const linked = await linkWhatsAppProfile(normalizePhone(phone), data.user);
  if (!linked.ok) return { ok: false, message: linked.message };

  return { ok: true, user: data.user, message: 'Logged in successfully' };
}

async function signOut(phone) {
  const db = getSupabase();
  const normalizedPhone = normalizePhone(phone);
  if (db) {
    await db
      .from('whatsapp_users')
      .update({ auth_mode: 'guest', updated_at: new Date().toISOString() })
      .eq('phone', normalizedPhone);
  }

  setUser(normalizedPhone, {
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
  hasServiceRoleKey,
  isValidEmail,
  isValidName,
  signUp,
  signIn,
  sendEmailOtp,
  verifyEmailOtp,
  signOut,
  linkWhatsAppProfile,
  restoreUserByPhone,
  checkDatabase,
  formatPhone,
  normalizePhone,
};
