/**
 * Deduplicate WhatsApp webhook deliveries (Meta retries when response is slow).
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

function claimInMemory(messageId) {
  const now = Date.now();
  pruneMemory(now);
  if (memory.has(messageId)) return false;
  memory.set(messageId, now);
  return true;
}

/**
 * @returns {Promise<boolean>} true if this delivery should be processed
 */
async function claimMessage(messageId) {
  if (!messageId) return true;

  // Fast path — blocks same-instance Meta retries
  if (!claimInMemory(messageId)) {
    logger.info('Duplicate webhook skipped (memory)', { messageId });
    return false;
  }

  try {
    const { getSupabase, isSupabaseReady } = require('../db/supabase');
    if (!isSupabaseReady()) return true;
    const db = getSupabase();
    if (!db) return true;

    const { data: existing } = await db
      .from('processed_webhook_messages')
      .select('message_id')
      .eq('message_id', messageId)
      .maybeSingle();

    if (existing) {
      logger.info('Duplicate webhook skipped (db)', { messageId });
      return false;
    }

    const { error } = await db.from('processed_webhook_messages').insert({
      message_id: messageId,
    });

    if (error) {
      // Unique violation = already processed on another instance
      if (error.code === '23505') {
        logger.info('Duplicate webhook skipped (db unique)', { messageId });
        return false;
      }
      // Table may not exist yet — memory dedupe still active
      logger.warn('Webhook dedupe DB insert failed', { message: error.message });
    }
  } catch (err) {
    logger.warn('Webhook dedupe DB unavailable', { message: err.message });
  }

  return true;
}

module.exports = { claimMessage, claimInMemory };
