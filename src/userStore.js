/**
 * Hybrid user store — sync API for flows, async Supabase/JSON persistence.
 */

const { dataFile, safeReadJson, safeWriteJson } = require('./core/dataDir');
const { getSupabase } = require('./db/supabase');
const logger = require('./core/logger');

const USERS_FILE = dataFile('users.json');
const cache = new Map();

function loadLocal() {
  return safeReadJson(USERS_FILE, {});
}

function saveLocal(users) {
  safeWriteJson(USERS_FILE, users);
}

function hydrateCache() {
  try {
    const local = loadLocal();
    for (const [phone, user] of Object.entries(local)) {
      if (!cache.has(phone)) cache.set(phone, user);
    }
  } catch {
    /* serverless — rely on Supabase */
  }
}

hydrateCache();

async function persistUser(phone, user) {
  const db = getSupabase();
  if (db) {
    const row = {
      phone,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      auth_mode: user.authMode,
      supabase_user_id: user.supabaseUserId,
      mysogi_token: user.mysogiToken,
      mysogi_user_id: user.userId,
      wallet_balance: user.walletBalance,
      bvn_verified: user.bvnVerified,
      kyc_level: user.kycLevel,
      metadata: user.metadata || {},
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from('whatsapp_users').upsert(row, { onConflict: 'phone' });
    if (error) logger.warn('Supabase setUser failed', { phone, error: error.message });
  }

  const users = loadLocal();
  users[phone] = user;
  saveLocal(users);
}

function getUser(phone) {
  if (cache.has(phone)) return cache.get(phone);
  const local = loadLocal()[phone] || null;
  if (local) cache.set(phone, local);
  return local;
}

function setUser(phone, patch) {
  const existing = getUser(phone) || { phone };
  const merged = { ...existing, ...patch, phone, updatedAt: new Date().toISOString() };
  cache.set(phone, merged);
  persistUser(phone, merged).catch((err) =>
    logger.warn('persistUser error', { phone, error: err.message })
  );
  return merged;
}

function isAuthenticated(phone) {
  const u = getUser(phone);
  return u?.authMode === 'authenticated' && !!u?.email;
}

function isLinked(phone) {
  return isAuthenticated(phone);
}

module.exports = { getUser, setUser, isAuthenticated, isLinked };
