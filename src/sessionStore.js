/**
 * Hybrid session store — sync API for flows, async Supabase/JSON persistence.
 */

const { dataFile, safeReadJson, safeWriteJson } = require('./core/dataDir');
const { getSupabase } = require('./db/supabase');
const logger = require('./core/logger');

const SESSIONS_FILE = dataFile('sessions.json');
const SESSION_TTL_HOURS = 24;

const cache = new Map();

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
  const payload = {
    step: session.step || 'idle',
    active_service: session.activeService || null,
    data: session.data || {},
    expires_at: new Date(Date.now() + SESSION_TTL_HOURS * 3600000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const db = getSupabase();
  if (db) {
    const { error } = await db.from('bot_sessions').upsert({ phone, ...payload });
    if (error) logger.warn('Supabase setSession failed', { phone, error: error.message });
  }

  const sessions = loadLocal();
  sessions[phone] = {
    step: payload.step,
    activeService: payload.active_service,
    data: payload.data,
    updatedAt: payload.updated_at,
  };
  saveLocal(sessions);
}

function getSession(phone) {
  if (cache.has(phone)) return cache.get(phone);
  const local = normalize(loadLocal()[phone]);
  if (local) cache.set(phone, local);
  return local;
}

function setSession(phone, session) {
  const normalized = {
    step: session.step || 'idle',
    activeService: session.activeService || null,
    data: session.data || {},
    updatedAt: new Date().toISOString(),
  };
  cache.set(phone, normalized);
  persistSession(phone, normalized).catch((err) =>
    logger.warn('persistSession error', { phone, error: err.message })
  );
}

function clearSession(phone) {
  cache.delete(phone);
  const db = getSupabase();
  if (db) db.from('bot_sessions').delete().eq('phone', phone).then(() => {});
  const sessions = loadLocal();
  delete sessions[phone];
  saveLocal(sessions);
}

async function loadSessionFromDb(phone) {
  const db = getSupabase();
  if (!db) return getSession(phone);

  const { data, error } = await db
    .from('bot_sessions')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error || !data) return getSession(phone);
  const session = normalize(data);
  cache.set(phone, session);
  return session;
}

module.exports = { getSession, setSession, clearSession, loadSessionFromDb };
