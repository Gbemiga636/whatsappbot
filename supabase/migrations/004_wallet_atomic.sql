-- Atomic wallet debit/credit (run in Supabase SQL Editor after 001–003)
-- Prevents lost-update races when multiple serverless instances touch the same balance.

CREATE OR REPLACE FUNCTION wallet_debit(p_phone TEXT, p_amount NUMERIC)
RETURNS TABLE(new_balance NUMERIC, ok BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, FALSE;
    RETURN;
  END IF;

  INSERT INTO whatsapp_users (phone, auth_mode, wallet_balance)
  VALUES (p_phone, 'guest', 0)
  ON CONFLICT (phone) DO NOTHING;

  SELECT wallet_balance INTO v_balance
  FROM whatsapp_users
  WHERE phone = p_phone
  FOR UPDATE;

  IF v_balance IS NULL THEN
    v_balance := 0;
  END IF;

  IF v_balance < p_amount THEN
    RETURN QUERY SELECT v_balance, FALSE;
    RETURN;
  END IF;

  v_balance := v_balance - p_amount;
  UPDATE whatsapp_users
  SET wallet_balance = v_balance, updated_at = NOW()
  WHERE phone = p_phone;

  RETURN QUERY SELECT v_balance, TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION wallet_credit(p_phone TEXT, p_amount NUMERIC)
RETURNS TABLE(new_balance NUMERIC, ok BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, FALSE;
    RETURN;
  END IF;

  INSERT INTO whatsapp_users (phone, auth_mode, wallet_balance)
  VALUES (p_phone, 'guest', 0)
  ON CONFLICT (phone) DO NOTHING;

  SELECT wallet_balance INTO v_balance
  FROM whatsapp_users
  WHERE phone = p_phone
  FOR UPDATE;

  IF v_balance IS NULL THEN
    v_balance := 0;
  END IF;

  v_balance := v_balance + p_amount;
  UPDATE whatsapp_users
  SET wallet_balance = v_balance, updated_at = NOW()
  WHERE phone = p_phone;

  RETURN QUERY SELECT v_balance, TRUE;
END;
$$;
