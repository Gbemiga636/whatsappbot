/**
 * Mysogi Credit Scoring — MVP alternative to Optasia's telco-data graph.
 * Builds score from wallet behavior, repayments, KYC, and transaction patterns.
 */

const { getSupabase } = require('../db/supabase');
const { getUser } = require('../userStore');
const wallet = require('../wallet/walletService');
const config = require('../config');
const logger = require('../core/logger');

const TIERS = [
  { min: 0, max: 249, tier: 'none', limit: 0 },
  { min: 250, max: 399, tier: 'bronze', limit: 2000 },
  { min: 400, max: 549, tier: 'silver', limit: 5000 },
  { min: 550, max: 699, tier: 'gold', limit: 10000 },
  { min: 700, max: 1000, tier: 'platinum', limit: 25000 },
];

function tierForScore(score) {
  return TIERS.find((t) => score >= t.min && score <= t.max) || TIERS[0];
}

async function fetchSignals(phone) {
  const db = getSupabase();
  const user = getUser(phone);
  const signals = {
    walletBalance: await wallet.getBalance(phone),
    kycLevel: user?.kycLevel || 0,
    bvnVerified: !!user?.bvnVerified,
    topupCount: 0,
    purchaseCount: 0,
    totalTopups: 0,
    totalPurchases: 0,
    accountAgeDays: 0,
    onTimeRepayments: 0,
    lateRepayments: 0,
    defaults: 0,
    creditActivated: false,
  };

  if (!db) return signals;

  const { data: userRow } = await db
    .from('whatsapp_users')
    .select('created_at, kyc_level, bvn_verified')
    .eq('phone', phone)
    .maybeSingle();

  if (userRow?.created_at) {
    signals.accountAgeDays = Math.floor(
      (Date.now() - new Date(userRow.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    signals.kycLevel = userRow.kyc_level || signals.kycLevel;
    signals.bvnVerified = !!userRow.bvn_verified;
  }

  const { data: txs } = await db
    .from('transactions')
    .select('type, amount, status, service')
    .eq('phone', phone)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(50);

  for (const tx of txs || []) {
    if (tx.type?.includes('topup')) {
      signals.topupCount += 1;
      signals.totalTopups += Number(tx.amount || 0);
    } else if (tx.type === 'purchase' || tx.service === 'airtime' || tx.service === 'bills') {
      signals.purchaseCount += 1;
      signals.totalPurchases += Number(tx.amount || 0);
    }
  }

  const { data: profile } = await db
    .from('credit_profiles')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (profile) {
    signals.onTimeRepayments = profile.on_time_repayments || 0;
    signals.lateRepayments = profile.late_repayments || 0;
    signals.defaults = profile.defaults || 0;
    signals.creditActivated = !!profile.activated;
  }

  return signals;
}

function computeScore(signals) {
  let score = 100; // base for any WhatsApp user

  // Account maturity
  if (signals.accountAgeDays >= 30) score += 80;
  else if (signals.accountAgeDays >= 7) score += 40;
  else if (signals.accountAgeDays >= 1) score += 15;

  // KYC trust
  if (signals.bvnVerified) score += 120;
  score += (signals.kycLevel || 0) * 40;

  // Wallet inflow (proxy for income stability)
  if (signals.topupCount >= 5) score += 100;
  else if (signals.topupCount >= 2) score += 60;
  else if (signals.topupCount >= 1) score += 30;

  if (signals.totalTopups >= 10000) score += 80;
  else if (signals.totalTopups >= 3000) score += 50;
  else if (signals.totalTopups >= 500) score += 25;

  // Transaction frequency (commerce graph)
  if (signals.purchaseCount >= 10) score += 90;
  else if (signals.purchaseCount >= 5) score += 55;
  else if (signals.purchaseCount >= 2) score += 30;
  else if (signals.purchaseCount >= 1) score += 15;

  // Repayment behavior (strongest signal once active)
  score += signals.onTimeRepayments * 25;
  score -= signals.lateRepayments * 40;
  score -= signals.defaults * 150;

  // Current wallet balance (liquidity)
  if (signals.walletBalance >= 5000) score += 40;
  else if (signals.walletBalance >= 1000) score += 20;

  return Math.max(0, Math.min(1000, Math.round(score)));
}

async function scoreUser(phone) {
  const normalized = wallet.normalizePhone(phone);
  const signals = await fetchSignals(normalized);
  const score = computeScore(signals);
  const { tier, limit } = tierForScore(score);

  const db = getSupabase();
  const profile = {
    phone: normalized,
    score,
    tier,
    credit_limit: limit,
    last_scored_at: new Date().toISOString(),
    signals,
  };

  let existing = null;
  if (db) {
    try {
      const { data } = await db
        .from('credit_profiles')
        .select('outstanding, activated, total_borrowed, total_repaid, on_time_repayments, late_repayments, defaults')
        .eq('phone', normalized)
        .maybeSingle();
      existing = data;

      await db.from('credit_profiles').upsert(
        {
          ...profile,
          outstanding: existing?.outstanding || 0,
          activated: existing?.activated || false,
          total_borrowed: existing?.total_borrowed || 0,
          total_repaid: existing?.total_repaid || 0,
          on_time_repayments: existing?.on_time_repayments || 0,
          late_repayments: existing?.late_repayments || 0,
          defaults: existing?.defaults || 0,
        },
        { onConflict: 'phone' }
      );
    } catch (err) {
      logger.warn('Credit profile save failed — run migration 003', { error: err.message });
    }
  }

  const available = Math.max(0, limit - Number(existing?.outstanding || 0));
  logger.info('Credit scored', { phone: normalized, score, tier, limit });
  return { score, tier, limit, signals, available, outstanding: Number(existing?.outstanding || 0) };
}

async function getProfile(phone) {
  const normalized = wallet.normalizePhone(phone);
  const db = getSupabase();

  if (!db) {
    const scored = await scoreUser(normalized);
    return { phone: normalized, ...scored, outstanding: 0, activated: false, available: scored.limit };
  }

  let { data } = await db.from('credit_profiles').select('*').eq('phone', normalized).maybeSingle();

  try {
    if (!data || !data.last_scored_at || Date.now() - new Date(data.last_scored_at).getTime() > 24 * 60 * 60 * 1000) {
      const scored = await scoreUser(normalized);
      ({ data } = await db.from('credit_profiles').select('*').eq('phone', normalized).maybeSingle());
      if (!data) {
        return {
          phone: normalized,
          score: scored.score,
          tier: scored.tier,
          credit_limit: scored.limit,
          outstanding: 0,
          activated: false,
          available: scored.limit,
        };
      }
    }
  } catch (err) {
    const scored = await scoreUser(normalized);
    return {
      phone: normalized,
      score: scored.score,
      tier: scored.tier,
      credit_limit: scored.limit,
      outstanding: 0,
      activated: false,
      available: scored.limit,
    };
  }

  const available = Math.max(0, Number(data.credit_limit || 0) - Number(data.outstanding || 0));
  return {
    phone: normalized,
    score: data.score,
    tier: data.tier,
    credit_limit: Number(data.credit_limit || 0),
    outstanding: Number(data.outstanding || 0),
    activated: !!data.activated,
    available,
    onTimeRepayments: data.on_time_repayments || 0,
    totalBorrowed: Number(data.total_borrowed || 0),
    totalRepaid: Number(data.total_repaid || 0),
  };
}

module.exports = { scoreUser, getProfile, computeScore, fetchSignals, tierForScore, TIERS };
