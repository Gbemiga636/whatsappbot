/**
 * Hybrid session store — sync API for flows, async Supabase/JSON persistence.
 */

const { dataFile, safeReadJson, safeWriteJson } = require('./core/dataDir');
const { getSupabase } = require('./db/supabase');
const logger = require('./core/logger');
const { normalizePhone: normalizePhoneUtil } = require('./utils/phone');

const SESSIONS_FILE = dataFile('sessions.json');
const SESSION_TTL_HOURS = 24;

const cache = new Map();

function phoneKey(phone) {
  return normalizePhoneUtil(phone);
}

function loadLocal() {
  return safeReadJson(SESSIONS_FILE, {});
}

function saveLocal(sessions) {
  safeWriteJson(SESSIONS_FILE, sessions);
}

function normalize(raw) {
  if (!raw) return null;
  return {
    step: raw.step || 'idle',
    activeService: raw.active_service || raw.activeService || null,
    data: raw.data || {},
    updatedAt: raw.updated_at || raw.updatedAt,
  };
}

function hydrateCache() {
  try {
    const local = loadLocal();
    for (const [phone, session] of Object.entries(local)) {
      if (!cache.has(phone)) cache.set(phone, normalize(session));
    }
  } catch {
    /* serverless — rely on Supabase */
  }
}

hydrateCache();

async function persistSession(phone, session) {
  const key = phoneKey(phone);
  const payload = {
    step: session.step || 'idle',
    active_service: session.activeService || null,
    data: session.data || {},
    expires_at: new Date(Date.now() + SESSION_TTL_HOURS * 3600000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const db = getSupabase();
  if (db) {
    const { error } = await db.from('bot_sessions').upsert({ phone: key, ...payload });
    if (error) logger.warn('Supabase setSession failed', { phone: key, error: error.message });
  }

  const sessions = loadLocal();
  sessions[key] = {
    step: payload.step,
    activeService: payload.active_service,
    data: payload.data,
    updatedAt: payload.updated_at,
  };
  saveLocal(sessions);
}

function getSession(phone) {
  const key = phoneKey(phone);
  if (cache.has(key)) return cache.get(key);
  const local = normalize(loadLocal()[key]);
  if (local) cache.set(key, local);
  return local;
}

function setSession(phone, session) {
  const key = phoneKey(phone);
  const normalized = {
    step: session.step || 'idle',
    activeService: session.activeService ?? null,
    data: session.data || {},
    updatedAt: new Date().toISOString(),
  };
  cache.set(key, normalized);
  persistSession(key, normalized).catch((err) =>
    logger.warn('persistSession error', { phone: key, error: err.message })
  );
  return normalized;
}

/** Persist session immediately — use before user taps a list/button */
async function setSessionAndWait(phone, session) {
  const normalized = setSession(phone, session);
  const key = phoneKey(phone);
  await persistSession(key, normalized);
  return normalized;
}

function clearSession(phone) {
  const key = phoneKey(phone);
  cache.delete(key);
  const db = getSupabase();
  if (db) db.from('bot_sessions').delete().eq('phone', key).then(() => {});
  const sessions = loadLocal();
  delete sessions[key];
  saveLocal(sessions);
}

async function loadSessionFromDb(phone) {
  const key = phoneKey(phone);
  const cached = getSession(key);
  const db = getSupabase();
  if (!db) return cached;

  const { data, error } = await db
    .from('bot_sessions')
    .select('*')
    .eq('phone', key)
    .maybeSingle();

  if (error || !data) return cached;

  const fromDb = normalize(data);
  if (cached?.updatedAt && fromDb.updatedAt) {
    const cacheTs = new Date(cached.updatedAt).getTime();
    const dbTs = new Date(fromDb.updatedAt).getTime();
    if (cacheTs >= dbTs) return cached;
  }

  cache.set(key, fromDb);
  return fromDb;
}

module.exports = { getSession, setSession, setSessionAndWait, clearSession, loadSessionFromDb };
