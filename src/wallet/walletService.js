/**
 * Mysogi Wallet — balance, top-up, debit with commission.
 */

const crypto = require('crypto');
const { getSupabase } = require('../db/supabase');
const { getUser, setUser } = require('../userStore');
const paystack = require('../providers/paystack');
const config = require('../config');
const logger = require('../core/logger');
const { normalizeProviderResult, isProviderSuccessMessage } = require('../utils/providerSuccess');
const { withWalletLock } = require('./walletLock');

function generateRef(prefix = 'WLT') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function calculateWithCommission(baseAmount) {
  const base = Number(baseAmount) || 0;
  const rate = config.wallet.commissionPercent / 100;
  const commission = Math.ceil(base * rate);
  const total = base + commission;
  return { base, commission, total, rate: config.wallet.commissionPercent };
}

async function getBalance(phone) {
  const db = getSupabase();
  if (!db) {
    const user = getUser(phone);
    return Number(user?.walletBalance || 0);
  }

  const { data, error } = await db
    .from('whatsapp_users')
    .select('wallet_balance')
    .eq('phone', phone)
    .maybeSingle();

  if (error || !data) {
    const user = getUser(phone);
    return Number(user?.walletBalance || 0);
  }

  const balance = Number(data.wallet_balance || 0);
  setUser(phone, { walletBalance: balance });
  return balance;
}

async function setBalance(phone, balance) {
  const db = getSupabase();
  if (db) {
    await db
      .from('whatsapp_users')
      .update({ wallet_balance: balance, updated_at: new Date().toISOString() })
      .eq('phone', phone);
  }
  setUser(phone, { walletBalance: balance });
  return balance;
}

async function addLedgerEntry(phone, { type, amount, balanceAfter, reference, service, metadata }) {
  const db = getSupabase();
  if (!db) return;

  try {
    const { error } = await db.from('wallet_ledger').insert({
      phone,
      type,
      amount,
      balance_after: balanceAfter,
      reference,
      service,
      metadata,
    });
    if (error && !error.message.includes('does not exist')) {
      logger.warn('Ledger entry failed', { error: error.message });
    }
  } catch (err) {
    logger.warn('Ledger unavailable', { error: err.message });
  }
}

async function ledgerEntryExists(reference, type) {
  const db = getSupabase();
  if (!db || !reference) return false;
  const { data } = await db
    .from('wallet_ledger')
    .select('id')
    .eq('reference', reference)
    .eq('type', type)
    .maybeSingle();
  return !!data;
}

async function tryRpcDebit(phone, amount) {
  const db = getSupabase();
  if (!db) return null;
  try {
    const { data, error } = await db.rpc('wallet_debit', {
      p_phone: normalizePhone(phone),
      p_amount: Number(amount),
    });
    if (error) {
      if (/wallet_debit|42883|does not exist/i.test(error.message || '')) return null;
      logger.warn('wallet_debit RPC failed', { error: error.message });
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { ok: !!row.ok, balance: Number(row.new_balance) };
  } catch {
    return null;
  }
}

async function tryRpcCredit(phone, amount) {
  const db = getSupabase();
  if (!db) return null;
  try {
    const { data, error } = await db.rpc('wallet_credit', {
      p_phone: normalizePhone(phone),
      p_amount: Number(amount),
    });
    if (error) {
      if (/wallet_credit|42883|does not exist/i.test(error.message || '')) return null;
      logger.warn('wallet_credit RPC failed', { error: error.message });
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { ok: !!row.ok, balance: Number(row.new_balance) };
  } catch {
    return null;
  }
}

async function claimPurchaseTransaction(phone, reference, { service, total, metadata }) {
  const db = getSupabase();
  if (!db || !metadata?.purchaseId) return { ok: true };

  const { data: existing } = await db
    .from('transactions')
    .select('status')
    .eq('reference', reference)
    .maybeSingle();

  if (existing?.status === 'completed') {
    return { ok: false, alreadyCompleted: true };
  }
  if (existing?.status === 'refunded') {
    return { ok: false, alreadyRefunded: true };
  }
  if (existing?.status === 'processing') {
    return { ok: false, inProgress: true };
  }

  const { error } = await db.from('transactions').insert({
    phone: normalizePhone(phone),
    service,
    type: metadata.type || 'purchase',
    amount: total,
    status: 'processing',
    reference,
    provider: metadata.provider || service,
    metadata: { ...metadata },
  });

  if (error?.code === '23505') {
    const { data: row } = await db.from('transactions').select('status').eq('reference', reference).maybeSingle();
    if (row?.status === 'completed') return { ok: false, alreadyCompleted: true };
    if (row?.status === 'refunded') return { ok: false, alreadyRefunded: true };
    return { ok: false, inProgress: true };
  }

  return { ok: true };
}

async function updatePurchaseTransaction(reference, status, extra = {}) {
  const db = getSupabase();
  if (!db || !reference) return;
  await db
    .from('transactions')
    .update({ status, updated_at: new Date().toISOString(), ...extra })
    .eq('reference', reference);
}

async function creditWallet(phone, amount, { reference, service, metadata = {} } = {}) {
  const credit = Number(amount);
  if (credit <= 0) return { ok: false, message: 'Invalid amount' };

  const entryType = metadata.type || 'topup';
  if (reference && (entryType === 'refund' || entryType === 'topup' || entryType === 'topup_gift')) {
    const exists = await ledgerEntryExists(reference, entryType === 'refund' ? 'refund' : entryType);
    if (exists) {
      const balance = await getBalance(phone);
      return { ok: true, balance, credited: 0, alreadyProcessed: true };
    }
  }

  return withWalletLock(normalizePhone(phone), async () => {
    const rpc = await tryRpcCredit(phone, credit);
    let newBalance;
    if (rpc?.ok) {
      newBalance = rpc.balance;
      setUser(phone, { walletBalance: newBalance });
    } else {
      const current = await getBalance(phone);
      newBalance = current + credit;
      await setBalance(phone, newBalance);
    }

    await addLedgerEntry(phone, {
      type: entryType,
      amount: credit,
      balanceAfter: newBalance,
      reference,
      service,
      metadata,
    });

    logger.info('Wallet credited', { phone, amount: credit, balance: newBalance, reference, type: entryType });
    return { ok: true, balance: newBalance, credited: credit };
  });
}

async function debitWallet(phone, totalAmount, { baseAmount, commission, reference, service, metadata = {} } = {}) {
  const total = Number(totalAmount);
  if (!total || total <= 0) return { ok: false, message: 'Invalid amount' };

  return withWalletLock(normalizePhone(phone), async () => {
    const rpc = await tryRpcDebit(phone, total);
    let newBalance;

    if (rpc) {
      if (!rpc.ok) {
        return {
          ok: false,
          insufficient: true,
          balance: rpc.balance,
          required: total,
          shortfall: total - rpc.balance,
        };
      }
      newBalance = rpc.balance;
      setUser(phone, { walletBalance: newBalance });
    } else {
      const current = await getBalance(phone);
      if (current < total) {
        return {
          ok: false,
          insufficient: true,
          balance: current,
          required: total,
          shortfall: total - current,
        };
      }
      newBalance = current - total;
      await setBalance(phone, newBalance);
    }

    await addLedgerEntry(phone, {
      type: 'debit',
      amount: -total,
      balanceAfter: newBalance,
      reference,
      service,
      metadata: { ...metadata, baseAmount, commission, mysogiCommission: commission },
    });

    if (commission > 0) {
      await addLedgerEntry(phone, {
        type: 'commission',
        amount: commission,
        balanceAfter: newBalance,
        reference,
        service: 'mysogi',
        metadata: { parentService: service, baseAmount },
      });
    }

    return { ok: true, balance: newBalance, debited: total, commission };
  });
}

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString('en-NG')}`;
}

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0')) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return digits;
}

function formatPhoneDisplay(phone) {
  const p = normalizePhone(phone);
  return p ? `+${p}` : phone;
}

async function ensureWalletUser(phone) {
  const db = getSupabase();
  if (!db) return;
  await db.from('whatsapp_users').upsert(
    { phone: normalizePhone(phone), auth_mode: 'guest', wallet_balance: 0 },
    { onConflict: 'phone', ignoreDuplicates: true }
  );
}

async function initiateTopUp(payerPhone, amount, { beneficiaryPhone, topupType = 'self' } = {}) {
  const topUpAmount = Number(amount);
  if (!topUpAmount || topUpAmount < 100) {
    return { ok: false, message: 'Minimum top-up is ₦100' };
  }

  const payer = normalizePhone(payerPhone);
  const beneficiary = normalizePhone(beneficiaryPhone || payerPhone);
  const isGift = topupType === 'gift' && beneficiary !== payer;

  if (isGift) {
    await ensureWalletUser(beneficiary);
  }

  const user = getUser(payer);
  const email = user?.email || `user_${payer}@mysogi.app`;
  const reference = generateRef(isGift ? 'GIFT' : 'TOPUP');

  const metadata = {
    phone: beneficiary,
    payer_phone: payer,
    type: 'wallet_topup',
    topup_type: isGift ? 'gift' : 'self',
    amount: topUpAmount,
  };

  const db = getSupabase();
  if (db) {
    await db.from('transactions').insert({
      phone: beneficiary,
      service: 'wallet',
      type: isGift ? 'topup_gift' : 'topup',
      amount: topUpAmount,
      status: 'pending',
      reference,
      provider: 'paystack',
      metadata,
    });
  }

  const callbackUrl = config.publicBaseUrl
    ? `${config.publicBaseUrl}/webhook/paystack/callback`
    : undefined;

  const payment = await paystack.initializePayment({
    email,
    amount: topUpAmount,
    reference,
    metadata,
    callbackUrl,
  });

  if (!payment.ok) {
    return { ok: false, message: payment.message };
  }

  return {
    ok: true,
    reference,
    paymentUrl: payment.authorizationUrl,
    amount: topUpAmount,
    beneficiary,
    payer,
    isGift,
  };
}

async function processTopUpWebhook(reference, paidAmount) {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Database not configured' };

  const { data: tx } = await db
    .from('transactions')
    .select('*')
    .eq('reference', reference)
    .maybeSingle();

  if (!tx) return { ok: false, message: 'Transaction not found' };
  if (tx.status === 'completed') {
    return {
      ok: true,
      alreadyProcessed: true,
      phone: tx.phone,
      payerPhone: tx.metadata?.payer_phone,
      isGift: tx.metadata?.topup_type === 'gift',
    };
  }

  const beneficiary = normalizePhone(tx.metadata?.phone || tx.phone);
  const payerPhone = normalizePhone(tx.metadata?.payer_phone || tx.phone);
  const isGift = tx.metadata?.topup_type === 'gift' && beneficiary !== payerPhone;

  if (!beneficiary) return { ok: false, message: 'No beneficiary phone on transaction' };

  await ensureWalletUser(beneficiary);

  const credit = await creditWallet(beneficiary, paidAmount, {
    reference,
    service: 'wallet',
    metadata: {
      type: isGift ? 'topup_gift' : 'topup',
      paystackRef: reference,
      payer_phone: payerPhone,
      topup_type: isGift ? 'gift' : 'self',
    },
  });

  await db
    .from('transactions')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('reference', reference);

  return {
    ok: true,
    phone: beneficiary,
    payerPhone,
    isGift,
    balance: credit.balance,
    amount: paidAmount,
  };
}

async function purchaseWithWallet(phone, { service, baseAmount, metadata = {}, execute }) {
  const normPhone = normalizePhone(phone);
  const { base, commission, total } = calculateWithCommission(baseAmount);

  if (total <= 0) {
    return { ok: false, message: 'Invalid purchase amount' };
  }

  const reference = metadata.purchaseId || generateRef(service.toUpperCase().slice(0, 4));
  const balance = await getBalance(normPhone);

  if (balance < total) {
    return {
      ok: false,
      insufficient: true,
      balance,
      required: total,
      shortfall: total - balance,
      base,
      commission,
    };
  }

  const claim = await claimPurchaseTransaction(normPhone, reference, {
    service,
    total,
    metadata: { ...metadata, baseAmount: base, commission },
  });

  if (claim.alreadyCompleted) {
    return {
      ok: true,
      alreadyProcessed: true,
      reference,
      balance: await getBalance(normPhone),
      base,
      commission,
      total,
    };
  }
  if (claim.inProgress) {
    return {
      ok: false,
      inProgress: true,
      message: 'This payment is already processing. Please wait a moment.',
      balance: await getBalance(normPhone),
    };
  }
  if (claim.alreadyRefunded) {
    return {
      ok: false,
      refunded: true,
      message: 'This payment was already refunded.',
      reference,
      balance: await getBalance(normPhone),
    };
  }

  const debit = await debitWallet(normPhone, total, {
    baseAmount: base,
    commission,
    reference,
    service,
    metadata,
  });

  if (!debit.ok) return debit;

  let result;
  try {
    result = normalizeProviderResult(await execute());
  } catch (err) {
    const msg = err.message || 'Provider error';
    const maybeProcessed = /timeout|econnaborted|etimedout|network error|socket hang up/i.test(msg);
    result = { ok: false, message: msg, maybeProcessed };
  }

  if (!result.ok && isProviderSuccessMessage(result.message)) {
    result = {
      ...result,
      ok: true,
      pendingWebhook: /webhook/i.test(String(result.message || '')),
    };
  }

  if (!result.ok) {
    logger.warn('Purchase provider failed', { phone: normPhone, service, reference, reason: result.message });

    if (result.maybeProcessed) {
      await updatePurchaseTransaction(reference, 'processing', {
        metadata: { ...metadata, baseAmount: base, commission, uncertain: true, reason: result.message },
      });
      return {
        ok: false,
        pending: true,
        message:
          'Your payment was received but delivery is still confirming. ' +
          'Check your line before retrying — your wallet was not refunded.',
        reference,
        balance: debit.balance,
        base,
        commission,
        total,
      };
    }

    const refund = await creditWallet(normPhone, total, {
      reference: `REFUND_${reference}`,
      service,
      metadata: { type: 'refund', originalRef: reference, reason: result.message },
    });

    await updatePurchaseTransaction(reference, 'refunded', {
      metadata: { ...metadata, baseAmount: base, commission, reason: result.message },
    });

    return {
      ok: false,
      refunded: (refund.credited || 0) > 0 || refund.alreadyProcessed,
      message: result.message || 'Purchase failed — wallet refunded',
      reference,
      balance: refund.balance ?? debit.balance,
      base,
      commission,
      total,
    };
  }

  const db = getSupabase();
  if (db) {
    if (metadata.purchaseId) {
      await updatePurchaseTransaction(reference, 'completed', {
        provider: metadata.provider || service,
        metadata: { ...metadata, baseAmount: base, commission, mysogiCommission: commission },
      });
    } else {
      await db.from('transactions').insert({
        phone: normPhone,
        service,
        type: metadata.type || 'purchase',
        amount: total,
        status: 'completed',
        reference,
        provider: metadata.provider || service,
        metadata: { ...metadata, baseAmount: base, commission, mysogiCommission: commission },
      });
    }
  }

  return {
    ok: true,
    reference,
    balance: debit.balance,
    base,
    commission,
    total,
    result,
  };
}

function formatWalletSummary(baseAmount) {
  const { base, commission, total, rate } = calculateWithCommission(baseAmount);
  return {
    text:
      `Amount: ${formatNaira(base)}\n` +
      `Mysogi fee (${rate}%): ${formatNaira(commission)}\n` +
      `*Total: ${formatNaira(total)}*`,
    base,
    commission,
    total,
  };
}

module.exports = {
  getBalance,
  creditWallet,
  debitWallet,
  initiateTopUp,
  processTopUpWebhook,
  purchaseWithWallet,
  calculateWithCommission,
  formatWalletSummary,
  formatNaira,
  formatPhoneDisplay,
  normalizePhone,
  generateRef,
};
