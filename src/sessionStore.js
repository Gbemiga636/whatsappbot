/**
 * Hybrid session store — sync API for flows, async Supabase/JSON persistence.
 */

const fs = require('fs');
const path = require('path');
const { getSupabase } = require('./db/supabase');
const logger = require('./core/logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SESSION_TTL_HOURS = 24;

const cache = new Map();

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadLocal() {
  ensureDataDir();
  if (!fs.existsSync(SESSIONS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveLocal(sessions) {
  ensureDataDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
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
  const local = loadLocal();
  for (const [phone, session] of Object.entries(local)) {
    if (!cache.has(phone)) cache.set(phone, normalize(session));
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
