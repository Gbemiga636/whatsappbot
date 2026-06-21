/**
 * Transaction persistence for all super-app services.
 */

const crypto = require('crypto');
const { getSupabase } = require('../db/supabase');
const logger = require('../core/logger');

function generateRef(prefix = 'MSG') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

async function createTransaction({ phone, service, type, amount, provider, metadata = {} }) {
  const reference = generateRef(service.toUpperCase().slice(0, 4));
  const row = {
    phone,
    service,
    type,
    amount,
    currency: 'NGN',
    status: 'pending',
    reference,
    provider: provider || null,
    metadata,
  };

  const db = getSupabase();
  if (db) {
    const { data, error } = await db.from('transactions').insert(row).select().single();
    if (error) {
      logger.warn('createTransaction failed', { error: error.message });
      return { ok: false, reference, error: error.message };
    }
    return { ok: true, transaction: data, reference };
  }

  return { ok: true, transaction: { ...row, id: reference }, reference, local: true };
}

async function updateTransaction(reference, patch) {
  const db = getSupabase();
  if (!db) return { ok: true, local: true };

  const { data, error } = await db
    .from('transactions')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('reference', reference)
    .select()
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, transaction: data };
}

async function getTransactionsByPhone(phone, limit = 10) {
  const db = getSupabase();
  if (!db) return [];

  const { data, error } = await db
    .from('transactions')
    .select('*')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn('getTransactionsByPhone failed', { error: error.message });
    return [];
  }
  return data || [];
}

module.exports = { createTransaction, updateTransaction, getTransactionsByPhone, generateRef };
