/**
 * Background: complete pending Paystack/OPay payments even if the user
 * closed the browser before the return URL loaded.
 * Scheduled via Netlify cron (see netlify.toml).
 */

const { initSupabase, getSupabase } = require('../../src/db/supabase');
const guestPurchase = require('../../src/wallet/guestPurchase');
const wallet = require('../../src/wallet/walletService');
const paystack = require('../../src/providers/paystack');
const opay = require('../../src/providers/opay');
const logger = require('../../src/core/logger');

initSupabase();

async function completeOne(tx) {
  const reference = tx.reference;
  const provider = tx.provider || tx.metadata?.paymentProvider || 'paystack';
  const verify =
    provider === 'opay' ? await opay.verifyPayment(reference) : await paystack.verifyPayment(reference);

  if (!verify.ok) {
    return { reference, status: 'not_paid_yet' };
  }

  const amount = Number(verify.amount || tx.amount || 0);
  const type = tx.metadata?.type || tx.type;

  if (type === 'guest_purchase') {
    const result = await guestPurchase.processGuestPurchaseWebhook(reference, amount, { provider });
    if (result.ok && result.phone && result.pending && result.purchase) {
      const alreadyNotified = await guestPurchase.wasGuestPurchaseNotified(reference);
      if (!result.alreadyProcessed || !alreadyNotified) {
        await guestPurchase.notifyGuestPurchaseResult({
          phone: result.phone,
          pending: result.pending,
          purchase: result.purchase,
        });
      }
    }
    return { reference, status: result.ok ? 'fulfilled_guest' : 'failed_guest' };
  }

  const result = await wallet.processTopUpWebhook(reference, amount);
  if (result.ok && result.phone) {
    const alreadyNotified = await wallet.wasTopUpWhatsAppNotified(reference);
    if (!result.alreadyProcessed || !alreadyNotified) {
      await wallet.notifyWalletTopUpSuccess({
        phone: result.phone,
        payerPhone: result.payerPhone,
        amount,
        balance: result.balance,
        reference,
        isGift: result.isGift,
      });
    }
  }
  return { reference, status: result.ok ? 'fulfilled_topup' : 'failed_topup' };
}

exports.handler = async () => {
  try {
    const db = getSupabase();
    if (!db) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'no_db' }) };
    }

    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await db
      .from('transactions')
      .select('reference, amount, provider, type, metadata, status, created_at')
      .eq('status', 'pending')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(40);

    if (error) throw error;

    const results = [];
    for (const tx of rows || []) {
      try {
        results.push(await completeOne(tx));
      } catch (err) {
        logger.warn('Pending payment complete failed', { reference: tx.reference, error: err.message });
        results.push({ reference: tx.reference, status: 'error', error: err.message });
      }
    }

    logger.info('Pending payments cron done', { checked: results.length, results });
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, checked: results.length, results }),
    };
  } catch (err) {
    logger.error('Pending payments cron failed', { message: err.message });
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
