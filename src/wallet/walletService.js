/**
 * Bygate Wallet — balance, top-up, debit with commission.
 */

const crypto = require('crypto');
const { getSupabase } = require('../db/supabase');
const { getUser, setUser } = require('../userStore');
const paystack = require('../providers/paystack');
const config = require('../config');
const logger = require('../core/logger');
const { normalizeProviderResult, isProviderSuccessMessage } = require('../utils/providerSuccess');
const { withWalletLock } = require('./walletLock');
const phoneUtil = require('../utils/phone');

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
  const key = normalizePhone(phone);
  const db = getSupabase();
  if (!db) {
    const user = getUser(key);
    return Number(user?.walletBalance || 0);
  }

  const { data, error } = await db
    .from('whatsapp_users')
    .select('wallet_balance, metadata')
    .eq('phone', key)
    .maybeSingle();

  if (error || !data) {
    const user = getUser(key);
    return Number(user?.walletBalance || 0);
  }

  const balance = Number(data.wallet_balance || 0);
  const user = getUser(key) || { phone: key };
  setUser(key, {
    ...user,
    walletBalance: balance,
    metadata: { ...(user.metadata || {}), ...(data.metadata || {}) },
  });
  return balance;
}

/** Force-sync wallet + metadata from DB (fixes stale balance after restart) */
async function refreshWalletFromDb(phone) {
  return getBalance(phone);
}

async function canAffordPurchase(phone, baseAmount) {
  const pricing = calculateWithCommission(baseAmount);
  const balance = await refreshWalletFromDb(phone);
  const shortfall = Math.max(0, pricing.total - balance);
  return {
    ok: balance >= pricing.total,
    balance,
    shortfall,
    ...pricing,
  };
}

async function setBalance(phone, balance) {
  const key = normalizePhone(phone);
  const db = getSupabase();
  if (db) {
    await db
      .from('whatsapp_users')
      .update({ wallet_balance: balance, updated_at: new Date().toISOString() })
      .eq('phone', key);
  }
  setUser(key, { walletBalance: balance });
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
        service: 'Bygate',
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
  return phoneUtil.normalizePhone(phone);
}

function formatPhoneDisplay(phone) {
  return phoneUtil.formatPhoneDisplay(phone);
}

async function ensureWalletUser(phone) {
  const key = normalizePhone(phone);
  const db = getSupabase();
  if (!db) return { ok: true, local: true };

  try {
    const { error } = await db.from('whatsapp_users').upsert(
      { phone: key, auth_mode: 'guest', wallet_balance: 0 },
      { onConflict: 'phone', ignoreDuplicates: true }
    );
    if (error) {
      logger.warn('ensureWalletUser failed', { phone: key, error: error.message });
      return { ok: false, message: error.message };
    }
    return { ok: true };
  } catch (err) {
    logger.warn('ensureWalletUser error', { phone: key, error: err.message });
    return { ok: false, message: err.message };
  }
}

async function initiateTopUp(payerPhone, amount, { beneficiaryPhone, topupType = 'self', provider = 'paystack' } = {}) {
  const topUpAmount = Number(amount);
  if (!topUpAmount || topUpAmount < 100) {
    return { ok: false, message: 'Minimum top-up is ₦100' };
  }

  const payer = normalizePhone(payerPhone);
  const beneficiary = normalizePhone(beneficiaryPhone || payerPhone);
  const isGift = topupType === 'gift' && beneficiary !== payer;
  const paymentProvider = provider === 'opay' ? 'opay' : 'paystack';

  if (isGift) {
    await ensureWalletUser(beneficiary);
  }

  const user = getUser(payer);
  const email = user?.email || `user_${payer}@bygate.app`;
  const reference = generateRef(isGift ? 'GIFT' : 'TOPUP');

  const metadata = {
    phone: beneficiary,
    payer_phone: payer,
    type: 'wallet_topup',
    topup_type: isGift ? 'gift' : 'self',
    amount: topUpAmount,
    paymentProvider,
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
      provider: paymentProvider,
      metadata,
    });
  }

  let payment;
  if (paymentProvider === 'opay') {
    const opay = require('../providers/opay');
    payment = await opay.initializePayment({
      email,
      phone: payer,
      amount: topUpAmount,
      reference,
      productName: isGift ? 'Bygate gift wallet top-up' : 'Bygate wallet top-up',
      productDescription: `Top up ₦${topUpAmount}`,
      callbackUrl: config.publicBaseUrl ? `${config.publicBaseUrl}/webhook/opay` : undefined,
      returnUrl: config.publicBaseUrl ? `${config.publicBaseUrl}/webhook/opay/callback` : undefined,
    });
  } else {
    const callbackUrl = config.publicBaseUrl
      ? `${config.publicBaseUrl}/webhook/paystack/callback`
      : undefined;
    payment = await paystack.initializePayment({
      email,
      amount: topUpAmount,
      reference,
      metadata,
      callbackUrl,
    });
  }

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
    provider: paymentProvider,
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
    alreadyProcessed: false,
  };
}

async function wasTopUpWhatsAppNotified(reference) {
  const db = getSupabase();
  if (!db) return false;
  const { data: tx } = await db.from('transactions').select('metadata').eq('reference', reference).maybeSingle();
  return !!tx?.metadata?.whatsapp_notified;
}

async function markTopUpWhatsAppNotified(reference) {
  const db = getSupabase();
  if (!db) return;
  const { data: tx } = await db.from('transactions').select('metadata').eq('reference', reference).maybeSingle();
  await db
    .from('transactions')
    .update({
      metadata: { ...(tx?.metadata || {}), whatsapp_notified: true },
      updated_at: new Date().toISOString(),
    })
    .eq('reference', reference);
}

async function notifyWalletTopUpSuccess({ phone, payerPhone, amount, balance, reference, isGift, creditRepaid }) {
  const whatsapp = require('../whatsapp');
  const normBeneficiary = normalizePhone(phone);
  const normPayer = normalizePhone(payerPhone || phone);

  try {
    if (isGift && normPayer && normPayer !== normBeneficiary) {
      await whatsapp.sendText(
        normPayer,
        `✅ *Gift sent!*\n\n` +
          `${formatNaira(amount)} sent to *${formatPhoneDisplay(normBeneficiary)}*\n` +
          `Ref: *${reference}*`
      );
      await whatsapp.sendText(
        normBeneficiary,
        `🎁 *You received wallet credit!*\n\n` +
          `+${formatNaira(amount)}\n` +
          `New balance: *${formatNaira(balance)}*\n\n` +
          `Someone topped up your Bygate wallet.\nType *menu* to start using it.`
      );
    } else if (normBeneficiary) {
      let msg =
        `✅ *Wallet topped up!*\n\n` +
        `+${formatNaira(amount)}\n` +
        `New balance: *${formatNaira(balance)}*`;
      if (creditRepaid) {
        msg += `\n\n💳 Credit repaid: ${formatNaira(creditRepaid)}`;
      }
      msg += `\n\nType *menu* to continue.`;
      await whatsapp.sendText(normBeneficiary, msg);
    }
    if (reference) await markTopUpWhatsAppNotified(reference);
    return true;
  } catch (err) {
    logger.warn('Wallet top-up WhatsApp notify failed', { phone: normBeneficiary, error: err.message });
    return false;
  }
}

/** Fallback when payment webhook credited wallet but WhatsApp notify was missed */
async function tryCompletePendingTopUp(phone) {
  const { getSession, setSession } = require('../sessionStore');
  const session = getSession(phone) || {};
  const reference = session.data?.pendingTopUp;
  if (!reference) return false;

  const db = getSupabase();
  let provider = 'paystack';
  if (db) {
    const { data: tx } = await db
      .from('transactions')
      .select('provider, metadata')
      .eq('reference', reference)
      .maybeSingle();
    provider = tx?.provider || tx?.metadata?.paymentProvider || 'paystack';
  }

  const verify =
    provider === 'opay'
      ? await require('../providers/opay').verifyPayment(reference)
      : await paystack.verifyPayment(reference);
  if (!verify.ok) return false;

  const result = await processTopUpWebhook(reference, verify.amount);
  if (!result.ok) return false;

  const alreadyNotified = await wasTopUpWhatsAppNotified(reference);
  if (!alreadyNotified) {
    await notifyWalletTopUpSuccess({
      phone: result.phone,
      payerPhone: result.payerPhone,
      amount: verify.amount,
      balance: result.balance,
      reference,
      isGift: result.isGift,
    });
  }

  setSession(phone, {
    ...session,
    data: { ...session.data, pendingTopUp: null },
  });
  return !alreadyNotified;
}

async function purchaseWithWallet(phone, { service, baseAmount, metadata = {}, execute }) {
  const normPhone = normalizePhone(phone);
  const { base, commission, total } = calculateWithCommission(baseAmount);

  if (total <= 0) {
    return { ok: false, message: 'Invalid purchase amount' };
  }

  const reference = metadata.purchaseId || generateRef(service.toUpperCase().slice(0, 4));
  const balance = await refreshWalletFromDb(normPhone);

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
      `Bygate fee (${rate}%): ${formatNaira(commission)}\n` +
      `*Total: ${formatNaira(total)}*`,
    base,
    commission,
    total,
  };
}

module.exports = {
  getBalance,
  refreshWalletFromDb,
  canAffordPurchase,
  creditWallet,
  debitWallet,
  ensureWalletUser,
  initiateTopUp,
  processTopUpWebhook,
  notifyWalletTopUpSuccess,
  tryCompletePendingTopUp,
  wasTopUpWhatsAppNotified,
  markTopUpWhatsAppNotified,
  purchaseWithWallet,
  calculateWithCommission,
  formatWalletSummary,
  formatNaira,
  formatPhoneDisplay,
  normalizePhone,
  generateRef,
};
