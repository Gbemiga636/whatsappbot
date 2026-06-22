/**
 * Mysogi Credit Service — instant credit in chat (Optasia competitor wedge).
 * Disbursement, repayment, auto-collection on wallet top-up.
 */

const crypto = require('crypto');
const { getSupabase } = require('../db/supabase');
const wallet = require('../wallet/walletService');
const creditScoring = require('./creditScoring');
const config = require('../config');
const logger = require('../core/logger');
const { normalizeProviderResult } = require('../utils/providerSuccess');

function generateRef(prefix = 'CRD') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function creditFee(baseAmount) {
  const rate = (config.credit.interestPercent || 5) / 100;
  return Math.ceil(Number(baseAmount) * rate);
}

function totalWithFee(baseAmount) {
  const base = Number(baseAmount) || 0;
  const fee = creditFee(base);
  return { base, fee, total: base + fee };
}

async function activateCreditLine(phone) {
  const profile = await creditScoring.scoreUser(phone);
  const minScore = config.credit.minScore || 250;

  if (profile.score < minScore) {
    return {
      ok: false,
      message:
        `Your Mysogi score is *${profile.score}* (need ${minScore}+).\n\n` +
        `Top up your wallet, buy airtime/bills, and repay on time to unlock credit.`,
      profile,
    };
  }

  const db = getSupabase();
  if (db) {
    await db.from('credit_profiles').update({ activated: true }).eq('phone', wallet.normalizePhone(phone));
  }

  return {
    ok: true,
    message:
      `✅ *Mysogi Credit activated!*\n\n` +
      `Score: *${profile.score}* (${profile.tier})\n` +
      `Limit: *${wallet.formatNaira(profile.limit)}*\n\n` +
      `Use *Pay with credit* when buying airtime, data, or bills.`,
    profile,
  };
}

async function checkEligibility(phone, amount) {
  if (!config.credit.enabled) {
    return { ok: false, message: 'Credit is not available right now.' };
  }

  const normalized = wallet.normalizePhone(phone);
  const profile = await creditScoring.getProfile(normalized);
  const { base, fee, total } = totalWithFee(amount);
  const maxSingle = config.credit.maxSinglePurchase || 5000;

  if (!profile.activated) {
    return {
      ok: false,
      needsActivation: true,
      message: 'Activate Mysogi Credit first. Type *credit* or tap Loans in menu.',
      profile,
    };
  }

  if (profile.score < (config.credit.minScore || 250)) {
    return { ok: false, message: 'Your credit score is too low. Build history to unlock.', profile };
  }

  if (base > maxSingle) {
    return {
      ok: false,
      message: `Maximum single credit purchase is ${wallet.formatNaira(maxSingle)}.`,
      profile,
    };
  }

  if (total > profile.available) {
    return {
      ok: false,
      insufficient: true,
      message:
        `Available credit: ${wallet.formatNaira(profile.available)}\n` +
        `You need: ${wallet.formatNaira(total)} (incl. ${wallet.formatNaira(fee)} fee)`,
      profile,
      shortfall: total - profile.available,
    };
  }

  return { ok: true, profile, base, fee, total, dueDays: config.credit.repaymentDays || 7 };
}

async function purchaseWithCredit(phone, { service, baseAmount, metadata = {}, execute }) {
  const eligibility = await checkEligibility(phone, baseAmount);
  if (!eligibility.ok) return eligibility;

  const normalized = wallet.normalizePhone(phone);
  const { base, fee, total } = eligibility;
  const reference = generateRef('BNPL');
  const dueAt = new Date(Date.now() + (config.credit.repaymentDays || 7) * 24 * 60 * 60 * 1000);
  const db = getSupabase();

  if (db) {
    await db.from('credit_transactions').insert({
      phone: normalized,
      type: 'disbursement',
      amount: total,
      service,
      status: 'pending',
      reference,
      due_at: dueAt.toISOString(),
      metadata: { ...metadata, baseAmount: base, fee, service },
    });
  }

  let result;
  try {
    result = normalizeProviderResult(await execute());
  } catch (err) {
    result = { ok: false, message: err.message };
  }

  if (!result.ok) {
    if (db) {
      await db.from('credit_transactions').update({ status: 'failed' }).eq('reference', reference);
    }
    return { ok: false, message: result.message || 'Purchase failed', reference };
  }

  if (db) {
    const { data: prof } = await db.from('credit_profiles').select('outstanding, total_borrowed').eq('phone', normalized).maybeSingle();
    const newOutstanding = Number(prof?.outstanding || 0) + total;
    await db.from('credit_profiles').update({
      outstanding: newOutstanding,
      total_borrowed: Number(prof?.total_borrowed || 0) + total,
    }).eq('phone', normalized);

    await db.from('credit_transactions').update({ status: 'active' }).eq('reference', reference);

    if (fee > 0) {
      await db.from('credit_transactions').insert({
        phone: normalized,
        type: 'fee',
        amount: fee,
        service: 'credit',
        status: 'active',
        reference: `${reference}_FEE`,
        parent_reference: reference,
        due_at: dueAt.toISOString(),
        metadata: { parentRef: reference },
      });
    }

    await db.from('transactions').insert({
      phone: normalized,
      service: 'credit',
      type: 'bnpl_purchase',
      amount: total,
      status: 'completed',
      reference,
      provider: 'mysogi_credit',
      metadata: { originalService: service, baseAmount: base, fee, dueAt: dueAt.toISOString() },
    });
  }

  logger.info('Credit disbursement', { phone: normalized, service, total, reference });

  return {
    ok: true,
    reference,
    base,
    fee,
    total,
    dueAt,
    result,
    paymentMethod: 'credit',
    profile: await creditScoring.getProfile(normalized),
  };
}

async function repayFromWallet(phone, amount) {
  const normalized = wallet.normalizePhone(phone);
  const profile = await creditScoring.getProfile(normalized);
  const outstanding = profile.outstanding || 0;

  if (outstanding <= 0) return { ok: true, repaid: 0, balance: await wallet.getBalance(normalized) };

  const repayAmount = Math.min(Number(amount), outstanding);
  const debit = await wallet.debitWallet(normalized, repayAmount, {
    reference: generateRef('REPAY'),
    service: 'credit',
    metadata: { type: 'credit_repay', auto: true },
  });

  if (!debit.ok) return { ok: false, message: 'Could not debit wallet for repayment', ...debit };

  const db = getSupabase();
  if (db) {
    const newOutstanding = outstanding - repayAmount;
    const isOnTime = true; // simplified for MVP

    await db.from('credit_profiles').update({
      outstanding: newOutstanding,
      total_repaid: (profile.totalRepaid || 0) + repayAmount,
      on_time_repayments: isOnTime ? (profile.onTimeRepayments || 0) + 1 : profile.onTimeRepayments,
    }).eq('phone', normalized);

    await db.from('credit_transactions').insert({
      phone: normalized,
      type: 'repayment',
      amount: repayAmount,
      service: 'credit',
      status: 'completed',
      reference: generateRef('REPAY'),
      paid_at: new Date().toISOString(),
      metadata: { method: 'wallet_auto' },
    });

    if (newOutstanding <= 0) {
      await db.from('credit_transactions')
        .update({ status: 'completed', paid_at: new Date().toISOString() })
        .eq('phone', normalized)
        .eq('status', 'active');
    }
  }

  logger.info('Credit repaid', { phone: normalized, amount: repayAmount });
  return { ok: true, repaid: repayAmount, balance: debit.balance, remaining: Math.max(0, outstanding - repayAmount) };
}

async function autoRepayOnTopUp(phone) {
  if (!config.credit.autoRepayOnTopUp) return null;
  const profile = await creditScoring.getProfile(phone);
  if ((profile.outstanding || 0) <= 0) return null;

  const balance = await wallet.getBalance(phone);
  if (balance <= 0) return null;

  return repayFromWallet(phone, balance);
}

async function manualRepay(phone) {
  const profile = await creditScoring.getProfile(phone);
  if ((profile.outstanding || 0) <= 0) {
    return { ok: false, message: 'You have no outstanding credit to repay.' };
  }

  const balance = await wallet.getBalance(phone);
  if (balance < profile.outstanding) {
    const shortfall = profile.outstanding - balance;
    return {
      ok: false,
      insufficient: true,
      message:
        `Outstanding: ${wallet.formatNaira(profile.outstanding)}\n` +
        `Wallet: ${wallet.formatNaira(balance)}\n` +
        `Top up ${wallet.formatNaira(shortfall)} more to clear your credit.`,
      outstanding: profile.outstanding,
      shortfall,
    };
  }

  return repayFromWallet(phone, profile.outstanding);
}

function formatCreditOffer(profile, amount, context = '') {
  const { fee, total } = totalWithFee(amount);
  const dueDays = config.credit.repaymentDays || 7;
  return (
    `⚡ *Instant credit approved*\n\n` +
    (context ? `${context}\n\n` : '') +
    `Amount: ${wallet.formatNaira(amount)}\n` +
    `Credit fee (${config.credit.interestPercent}%): ${wallet.formatNaira(fee)}\n` +
    `*Total due: ${wallet.formatNaira(total)}* in ${dueDays} days\n\n` +
    `Available credit: ${wallet.formatNaira(profile.available)}\n` +
    `_Repays automatically when you top up your wallet._`
  );
}

module.exports = {
  activateCreditLine,
  checkEligibility,
  purchaseWithCredit,
  repayFromWallet,
  autoRepayOnTopUp,
  manualRepay,
  formatCreditOffer,
  creditFee,
  totalWithFee,
  generateRef,
};
