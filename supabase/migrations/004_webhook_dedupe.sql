-- Deduplicate Meta WhatsApp webhook retries across serverless cold starts
CREATE TABLE IF NOT EXISTS processed_webhook_messages (
  message_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processed_webhook_created
  ON processed_webhook_messages (created_at DESC);
