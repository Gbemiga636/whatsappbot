-- Wallet ledger + Business partners
-- Run in Supabase SQL Editor after 001_initial_schema.sql

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('topup', 'debit', 'refund', 'commission')),
  amount NUMERIC(15,2) NOT NULL,
  balance_after NUMERIC(15,2) NOT NULL,
  reference TEXT,
  service TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_phone ON wallet_ledger(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_reference ON wallet_ledger(reference);

-- Business partners on Mysogi platform
CREATE TABLE IF NOT EXISTS business_partners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_phone TEXT NOT NULL,
  business_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended')),
  commission_rate NUMERIC(5,2) DEFAULT 5.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_partners_owner ON business_partners(owner_phone);
CREATE INDEX IF NOT EXISTS idx_business_partners_status ON business_partners(status);

CREATE TABLE IF NOT EXISTS business_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id UUID REFERENCES business_partners(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(15,2) NOT NULL,
  emoji TEXT DEFAULT '🏪',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_services_partner ON business_services(partner_id);
CREATE INDEX IF NOT EXISTS idx_business_services_active ON business_services(active);

ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role wallet_ledger" ON wallet_ledger FOR ALL USING (true);
CREATE POLICY "Service role business_partners" ON business_partners FOR ALL USING (true);
CREATE POLICY "Service role business_services" ON business_services FOR ALL USING (true);
