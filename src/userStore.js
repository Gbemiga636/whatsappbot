/**
 * Hybrid user store — sync API for flows, async Supabase/JSON persistence.
 */

const { dataFile, safeReadJson, safeWriteJson } = require('./core/dataDir');
const { getSupabase } = require('./db/supabase');
const logger = require('./core/logger');
const wallet = require('./wallet/walletService');

const USERS_FILE = dataFile('users.json');
const cache = new Map();

function phoneKey(phone) {
  return wallet.normalizePhone(phone) || String(phone || '').replace(/\D/g, '');
}

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
  const key = phoneKey(phone);
  const db = getSupabase();
  if (db) {
    const row = {
      phone: key,
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
  users[key] = { ...user, phone: key };
  saveLocal(users);
}

function getUser(phone) {
  const key = phoneKey(phone);
  if (cache.has(key)) return cache.get(key);
  const local = loadLocal()[key] || null;
  if (local) cache.set(key, local);
  return local;
}

function setUser(phone, patch) {
  const key = phoneKey(phone);
  const existing = getUser(key) || { phone: key };
  const merged = { ...existing, ...patch, phone: key, updatedAt: new Date().toISOString() };
  cache.set(key, merged);
  persistUser(key, merged).catch((err) =>
    logger.warn('persistUser error', { phone: key, error: err.message })
  );
  return merged;
}

function isAuthenticated(phone) {
  const u = getUser(phoneKey(phone));
  return u?.authMode === 'authenticated' && !!u?.email;
}

function isLinked(phone) {
  return isAuthenticated(phone);
}

module.exports = { getUser, setUser, isAuthenticated, isLinked };
