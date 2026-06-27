/**
 * Guest checkout — Paystack link at payment time (no wallet / PIN).
 */

const crypto = require('crypto');
const whatsapp = require('../whatsapp');
const paystack = require('../providers/paystack');
const config = require('../config');
const { getSupabase } = require('../db/supabase');
const { getSession, setSession } = require('../sessionStore');
const { normalizePhone } = require('../utils/phone');
const wallet = require('./walletService');
const logger = require('../core/logger');

function buildPendingSnapshot(session) {
  return {
    airtime: session.data?.airtime ? { ...session.data.airtime } : null,
    bill: session.data?.bill ? { ...session.data.bill } : null,
    food: session.data?.food ? JSON.parse(JSON.stringify(session.data.food)) : null,
  };
}

function buildExecute(pending) {
  const telecom = require('../providers/telecomProvider');
  const { service, baseAmount, snapshot } = pending;
  const airtime = snapshot?.airtime;
  const bill = snapshot?.bill;
  const food = snapshot?.food;

  if (service === 'airtime') {
    if (!airtime) return null;
    return () =>
      telecom.purchaseAirtime({
        network: airtime.network,
        phone: airtime.phone,
        amount: airtime.amount || baseAmount,
        type: airtime.type,
        plan: airtime.value,
        resolvedPlan: airtime.resolvedPlan,
      });
  }
  if (service === 'bills') {
    if (!bill) return null;
    return () => telecom.payBill({ ...bill, phone: pending.phone });
  }
  if (service === 'partners') {
    return async () => ({ ok: true, message: 'Order placed' });
  }
  if (service === 'food') {
    if (!food?.checkout || !food?.vendor) return null;
    const chowdeck = require('../providers/chowdeck');
    const checkout = food.checkout;
    const orderRef = chowdeck.buildOrderReference();
    return async () => {
      let deliveryNote = '';
      if (checkout.feeId) {
        const delivery = await chowdeck.createRelayDelivery({
          feeId: checkout.feeId,
          source: checkout.source,
          destination: checkout.destination,
          customer: { name: 'Mysogi Guest', phone: pending.phone },
          orderReference: orderRef,
          notes: `Food order ${orderRef}`,
        });
        deliveryNote = delivery.ok
          ? `\nDelivery ref: *${delivery.reference}*`
          : `\n_${delivery.message || 'Delivery dispatch pending'}_`;
      }
      return {
        ok: true,
        message: `Order placed with *${food.vendor.name}*.${deliveryNote}`,
        orderReference: orderRef,
      };
    };
  }
  return null;
}

async function initiateGuestPurchase(phone, opts) {
  const normPhone = normalizePhone(phone);
  const session = getSession(normPhone) || { data: {} };
  const purchaseId = opts.purchaseId || `GST_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const snapshot = opts.snapshot || buildPendingSnapshot(session);
  const { base, commission, total } = wallet.calculateWithCommission(opts.baseAmount);

  const pending = {
    method: 'paystack',
    phone: normPhone,
    service: opts.service,
    baseAmount: opts.baseAmount,
    summaryText: opts.summaryText,
    purchaseId,
    snapshot,
  };

  const email = `guest_${normPhone}@mysogi.app`;
  const metadata = {
    type: 'guest_purchase',
    phone: normPhone,
    service: opts.service,
    baseAmount: base,
    commission,
    total,
    summaryText: opts.summaryText,
    snapshot,
    purchaseId,
  };

  const db = getSupabase();
  if (db) {
    await wallet.ensureWalletUser(normPhone);
    await db.from('transactions').insert({
      phone: normPhone,
      service: opts.service,
      type: 'guest_purchase',
      amount: total,
      status: 'pending',
      reference: purchaseId,
      provider: 'paystack',
      metadata,
    });
  }

  const callbackUrl = config.publicBaseUrl
    ? `${config.publicBaseUrl}/webhook/paystack/callback`
    : undefined;

  const payment = await paystack.initializePayment({
    email,
    amount: total,
    reference: purchaseId,
    metadata,
    callbackUrl,
  });

  if (!payment.ok) {
    return { ok: false, message: payment.message };
  }

  setSession(normPhone, {
    ...session,
    data: { ...session.data, pendingGuestPurchase: purchaseId },
  });

  return {
    ok: true,
    reference: purchaseId,
    paymentUrl: payment.authorizationUrl,
    total,
    base,
    commission,
    pending,
  };
}

async function fulfillGuestPurchase(pending) {
  const { normalizeProviderResult, isProviderSuccessMessage } = require('../utils/providerSuccess');
  const execute = buildExecute(pending);
  if (!execute) {
    return { ok: false, message: 'Order session expired. Start again from the menu.' };
  }

  let result;
  try {
    result = normalizeProviderResult(await execute());
  } catch (err) {
    result = { ok: false, message: err.message || 'Provider error' };
  }

  if (!result.ok && isProviderSuccessMessage(result.message)) {
    result = { ...result, ok: true, pendingWebhook: /webhook/i.test(String(result.message || '')) };
  }

  const pricing = wallet.calculateWithCommission(pending.baseAmount);
  return {
    ok: result.ok,
    reference: pending.purchaseId,
    total: pricing.total,
    base: pricing.base,
    commission: pricing.commission,
    result,
    message: result.message,
    paymentMethod: 'paystack',
  };
}

async function processGuestPurchaseWebhook(reference, paidAmount) {
  const db = getSupabase();
  if (!db) return { ok: false, message: 'Database not configured' };

  const { data: tx } = await db.from('transactions').select('*').eq('reference', reference).maybeSingle();
  if (!tx) return { ok: false, message: 'Transaction not found' };
  if (tx.metadata?.type !== 'guest_purchase') {
    return { ok: false, message: 'Not a guest purchase' };
  }
  if (tx.status === 'completed') {
    return { ok: true, alreadyProcessed: true, phone: tx.phone };
  }
  if (tx.status === 'failed') {
    return { ok: false, message: 'Purchase already failed' };
  }

  const expected = Number(tx.metadata?.total || tx.amount);
  if (paidAmount < expected - 0.01) {
    logger.warn('Guest purchase underpaid', { reference, paidAmount, expected });
    return { ok: false, message: 'Amount mismatch' };
  }

  const pending = {
    phone: normalizePhone(tx.metadata?.phone || tx.phone),
    service: tx.metadata?.service || tx.service,
    baseAmount: tx.metadata?.baseAmount,
    summaryText: tx.metadata?.summaryText,
    purchaseId: reference,
    snapshot: tx.metadata?.snapshot,
  };

  const purchase = await fulfillGuestPurchase(pending);

  if (!purchase.ok) {
    await db
      .from('transactions')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString(),
        metadata: { ...tx.metadata, failure_reason: purchase.message },
      })
      .eq('reference', reference);

    return { ok: false, phone: pending.phone, purchase, needsRefund: true };
  }

  await db
    .from('transactions')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString(),
      metadata: { ...tx.metadata, fulfilled_at: new Date().toISOString() },
    })
    .eq('reference', reference);

  return {
    ok: true,
    phone: pending.phone,
    purchase,
    pending,
    alreadyProcessed: false,
  };
}

async function wasGuestPurchaseNotified(reference) {
  const db = getSupabase();
  if (!db) return false;
  const { data: tx } = await db.from('transactions').select('metadata').eq('reference', reference).maybeSingle();
  return !!tx?.metadata?.whatsapp_notified;
}

async function markGuestPurchaseNotified(reference) {
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

async function notifyGuestPurchaseResult({ phone, pending, purchase }) {
  const pinGate = require('../security/pinGate');
  await pinGate.sendPurchaseResult(phone, pending, purchase);
  if (pending?.purchaseId) await markGuestPurchaseNotified(pending.purchaseId);
}

async function tryCompletePendingGuestPurchase(phone) {
  const session = getSession(phone) || {};
  const reference = session.data?.pendingGuestPurchase;
  if (!reference) return false;

  const verify = await paystack.verifyPayment(reference);
  if (!verify.ok) return false;

  const result = await processGuestPurchaseWebhook(reference, verify.amount);
  if (!result.ok || !result.phone) return false;

  const alreadyNotified = await wasGuestPurchaseNotified(reference);
  if (!alreadyNotified && result.pending && result.purchase) {
    await notifyGuestPurchaseResult({
      phone: result.phone,
      pending: result.pending,
      purchase: result.purchase,
    });
  }

  setSession(phone, {
    ...session,
    data: { ...session.data, pendingGuestPurchase: null },
  });
  return !alreadyNotified;
}

module.exports = {
  initiateGuestPurchase,
  processGuestPurchaseWebhook,
  fulfillGuestPurchase,
  notifyGuestPurchaseResult,
  tryCompletePendingGuestPurchase,
  buildPendingSnapshot,
  wasGuestPurchaseNotified,
  markGuestPurchaseNotified,
};
