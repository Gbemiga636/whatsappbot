/**
 * Supabase client — primary database & auth backend.
 * Returns null when not configured (falls back to local JSON stores).
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const logger = require('../core/logger');

let client = null;
let ready = false;

function buildRealtimeOptions() {
  // Supabase realtime needs WebSocket. Node 22+ has it natively; Node 20 needs `ws`.
  try {
    // eslint-disable-next-line global-require
    const ws = require('ws');
    return { transport: ws };
  } catch {
    return undefined;
  }
}

function initSupabase() {
  const { url, serviceRoleKey, anonKey } = config.supabase;

  if (!url || (!serviceRoleKey && !anonKey)) {
    logger.warn('Supabase not configured — using local JSON storage', {
      hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env',
    });
    return null;
  }

  const key = serviceRoleKey || anonKey;
  const realtime = buildRealtimeOptions();
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(realtime ? { realtime } : {}),
  });
  ready = true;
  logger.info('Supabase connected', { url });
  return client;
}

function getSupabase() {
  if (!client && !ready) initSupabase();
  return client;
}

function isSupabaseReady() {
  return ready && !!client;
}

function hasServiceRoleKey() {
  return !!config.supabase.serviceRoleKey;
}

module.exports = { getSupabase, isSupabaseReady, hasServiceRoleKey, initSupabase };
