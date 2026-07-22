-- User reminders (WhatsApp event alerts)
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  title TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'once',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_due
  ON reminders (enabled, remind_at)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_reminders_phone ON reminders (phone);
