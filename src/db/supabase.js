/**
 * Supabase client — primary database & auth backend.
 * Returns null when not configured (falls back to local JSON stores).
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const logger = require('../core/logger');

let client = null;
let ready = false;

function initSupabase() {
  const { url, serviceRoleKey, anonKey } = config.supabase;

  if (!url || (!serviceRoleKey && !anonKey)) {
    logger.warn('Supabase not configured — using local JSON storage', {
      hint: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env',
    });
    return null;
  }

  const key = serviceRoleKey || anonKey;
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
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
