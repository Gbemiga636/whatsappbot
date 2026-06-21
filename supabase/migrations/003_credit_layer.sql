-- Mysogi Credit Layer — WhatsApp-native BNPL & instant credit (Optasia competitor wedge)
-- Run after 001 + 002 in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS credit_profiles (
  phone TEXT PRIMARY KEY,
  score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 1000),
  tier TEXT DEFAULT 'bronze' CHECK (tier IN ('none', 'bronze', 'silver', 'gold', 'platinum')),
  credit_limit NUMERIC(15,2) DEFAULT 0,
  outstanding NUMERIC(15,2) DEFAULT 0,
  total_borrowed NUMERIC(15,2) DEFAULT 0,
  total_repaid NUMERIC(15,2) DEFAULT 0,
  on_time_repayments INTEGER DEFAULT 0,
  late_repayments INTEGER DEFAULT 0,
  defaults INTEGER DEFAULT 0,
  activated BOOLEAN DEFAULT FALSE,
  last_scored_at TIMESTAMPTZ,
  signals JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_profiles_tier ON credit_profiles(tier);
CREATE INDEX IF NOT EXISTS idx_credit_profiles_score ON credit_profiles(score);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('disbursement', 'repayment', 'fee', 'writeoff')),
  amount NUMERIC(15,2) NOT NULL,
  service TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'failed', 'written_off')),
  reference TEXT UNIQUE,
  parent_reference TEXT,
  due_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_tx_phone ON credit_transactions(phone);
CREATE INDEX IF NOT EXISTS idx_credit_tx_status ON credit_transactions(status);
CREATE INDEX IF NOT EXISTS idx_credit_tx_reference ON credit_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_credit_tx_due ON credit_transactions(due_at);

ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_type_check;
ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_type_check
  CHECK (type IN ('topup', 'debit', 'refund', 'commission', 'credit_repay'));

CREATE TRIGGER credit_profiles_updated_at
  BEFORE UPDATE ON credit_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER credit_transactions_updated_at
  BEFORE UPDATE ON credit_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE credit_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access credit_profiles"
  ON credit_profiles FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access credit_transactions"
  ON credit_transactions FOR ALL USING (true) WITH CHECK (true);
