-- Mysogi Super App — Supabase schema
-- Run in Supabase SQL Editor or via: supabase db push

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- WhatsApp users (linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS whatsapp_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  auth_mode TEXT DEFAULT 'guest' CHECK (auth_mode IN ('guest', 'authenticated', 'pending')),
  supabase_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mysogi_token TEXT,
  mysogi_user_id TEXT,
  wallet_balance NUMERIC(15,2) DEFAULT 0,
  bvn_verified BOOLEAN DEFAULT FALSE,
  kyc_level INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_users_phone ON whatsapp_users(phone);
CREATE INDEX IF NOT EXISTS idx_whatsapp_users_email ON whatsapp_users(email);
CREATE INDEX IF NOT EXISTS idx_whatsapp_users_supabase ON whatsapp_users(supabase_user_id);

-- Conversation sessions
CREATE TABLE IF NOT EXISTS bot_sessions (
  phone TEXT PRIMARY KEY,
  step TEXT NOT NULL DEFAULT 'idle',
  active_service TEXT,
  data JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_service ON bot_sessions(active_service);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_expires ON bot_sessions(expires_at);

-- OTP codes (hashed)
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_phone_email ON otp_codes(phone, email);

-- Transactions (all services)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL,
  service TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC(15,2),
  currency TEXT DEFAULT 'NGN',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  reference TEXT UNIQUE,
  provider TEXT,
  provider_ref TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_phone ON transactions(phone);
CREATE INDEX IF NOT EXISTS idx_transactions_service ON transactions(service);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference);

-- Orders (food, grocery, pharmacy, marketplace)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL,
  service TEXT NOT NULL,
  items JSONB DEFAULT '[]',
  total_amount NUMERIC(15,2),
  delivery_address TEXT,
  status TEXT DEFAULT 'pending',
  vendor_id TEXT,
  rider_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Campaigns (Ads Studio)
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL,
  type TEXT NOT NULL,
  name TEXT,
  status TEXT DEFAULT 'draft',
  payload JSONB DEFAULT '{}',
  mysogi_campaign_id TEXT,
  sync_status TEXT DEFAULT 'local',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_phone ON campaigns(phone);

-- Service audit log
CREATE TABLE IF NOT EXISTS service_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT,
  service TEXT,
  action TEXT,
  input TEXT,
  output TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_logs_phone ON service_logs(phone, created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_users_updated ON whatsapp_users;
CREATE TRIGGER trg_whatsapp_users_updated
  BEFORE UPDATE ON whatsapp_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_bot_sessions_updated ON bot_sessions;
CREATE TRIGGER trg_bot_sessions_updated
  BEFORE UPDATE ON bot_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_transactions_updated ON transactions;
CREATE TRIGGER trg_transactions_updated
  BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated ON orders;
CREATE TRIGGER trg_orders_updated
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_campaigns_updated ON campaigns;
CREATE TRIGGER trg_campaigns_updated
  BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security (enable when using anon key from client)
ALTER TABLE whatsapp_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; these policies are for future client access
CREATE POLICY "Service role full access" ON whatsapp_users FOR ALL USING (true);
CREATE POLICY "Service role full access sessions" ON bot_sessions FOR ALL USING (true);
CREATE POLICY "Service role full access tx" ON transactions FOR ALL USING (true);
CREATE POLICY "Service role full access orders" ON orders FOR ALL USING (true);
CREATE POLICY "Service role full access campaigns" ON campaigns FOR ALL USING (true);
