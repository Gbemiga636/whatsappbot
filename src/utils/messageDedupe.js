/**
 * Deduplicate WhatsApp webhook deliveries (Meta retries when response is slow).
 *
 * IMPORTANT: only mark a message as fully processed AFTER handling succeeds.
 * Claiming in DB before handling caused silent drops when the function froze mid-run.
 */

const logger = require('../core/logger');

const memory = new Map();
const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 5000;

function pruneMemory(now = Date.now()) {
  for (const [id, ts] of memory) {
    if (now - ts > TTL_MS) memory.delete(id);
  }
  if (memory.size >= MAX_ENTRIES) {
    const oldest = [...memory.entries()].sort((a, b) => a[1] - b[1]).slice(0, 1000);
    for (const [id] of oldest) memory.delete(id);
  }
}

/** In-flight lock for this warm instance (blocks parallel duplicate delivery). */
function beginProcessing(messageId) {
  if (!messageId) return true;
  const now = Date.now();
  pruneMemory(now);
  const existing = memory.get(messageId);
  if (existing && now - existing < TTL_MS) {
    logger.info('Duplicate webhook skipped (in-flight/memory)', { messageId });
    return false;
  }
  memory.set(messageId, now);
  return true;
}

function releaseProcessing(messageId) {
  if (messageId) memory.delete(messageId);
}

async function wasAlreadyProcessed(messageId) {
  if (!messageId) return false;
  try {
    const { getSupabase, isSupabaseReady } = require('../db/supabase');
    if (!isSupabaseReady()) return false;
    const db = getSupabase();
    if (!db) return false;

    const { data: existing, error } = await db
      .from('processed_webhook_messages')
      .select('message_id')
      .eq('message_id', messageId)
      .maybeSingle();

    if (error) {
      // Table missing / RLS — do not block messages
      logger.warn('Webhook dedupe DB check failed', { message: error.message });
      return false;
    }
    return !!existing;
  } catch (err) {
    logger.warn('Webhook dedupe DB unavailable', { message: err.message });
    return false;
  }
}

async function markMessageProcessed(messageId) {
  if (!messageId) return;
  try {
    const { getSupabase, isSupabaseReady } = require('../db/supabase');
    if (!isSupabaseReady()) return;
    const db = getSupabase();
    if (!db) return;

    const { error } = await db.from('processed_webhook_messages').insert({
      message_id: messageId,
    });
    if (error && error.code !== '23505') {
      logger.warn('Webhook dedupe DB insert failed', { message: error.message });
    }
  } catch (err) {
    logger.warn('Webhook dedupe mark failed', { message: err.message });
  }
}

/**
 * @returns {Promise<boolean>} true if this delivery should be processed
 */
async function claimMessage(messageId) {
  if (!messageId) return true;
  if (await wasAlreadyProcessed(messageId)) {
    logger.info('Duplicate webhook skipped (already processed)', { messageId });
    return false;
  }
  return beginProcessing(messageId);
}

module.exports = {
  claimMessage,
  beginProcessing,
  releaseProcessing,
  markMessageProcessed,
  wasAlreadyProcessed,
};
