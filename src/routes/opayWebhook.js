/**
 * OPay webhook — wallet top-up and guest purchases.
 */

const config = require('../config');
const opay = require('../providers/opay');
const wallet = require('../wallet/walletService');
const guestPurchase = require('../wallet/guestPurchase');
const { getSupabase } = require('../db/supabase');
const logger = require('../core/logger');

async function getTransaction(reference) {
  const db = getSupabase();
  if (!db) return null;
  const { data: tx } = await db.from('transactions').select('*').eq('reference', reference).maybeSingle();
  return tx;
}

async function handleOpayWebhook(req, res) {
  try {
    const body = req.body || {};
    const payload = body.data || body.payload || body;
    const reference =
      payload.reference ||
      payload.orderNo ||
      body.reference ||
      req.query.reference;

    if (!reference) {
      logger.warn('OPay webhook missing reference', { body });
      return res.status(400).json({ ok: false, message: 'Missing reference' });
    }

    const verify = await opay.verifyPayment(reference);
    if (!verify.ok) {
      logger.warn('OPay webhook — payment not successful', { reference, status: verify.status });
      return res.json({ ok: true, ignored: true });
    }

    const amount = Number(verify.amount || 0);
    const tx = await getTransaction(reference);
    const txType = tx?.metadata?.type || tx?.type || payload?.metadata?.type;

    if (txType === 'guest_purchase') {
      const result = await guestPurchase.processGuestPurchaseWebhook(reference, amount, {
        provider: 'opay',
      });
      if (result.ok && result.phone && result.pending && result.purchase) {
        const alreadyNotified = await guestPurchase.wasGuestPurchaseNotified(reference);
        if (!result.alreadyProcessed || !alreadyNotified) {
          try {
            await guestPurchase.notifyGuestPurchaseResult({
              phone: result.phone,
              pending: result.pending,
              purchase: result.purchase,
            });
          } catch (err) {
            logger.warn('OPay guest notify failed', { error: err.message });
          }
        }
      } else if (!result.ok && result.needsRefund) {
        try {
          const whatsapp = require('../whatsapp');
          await whatsapp.sendText(
            result.phone,
            `⚠️ *Payment received but order failed*\n\n` +
              `Ref: *${reference}*\n` +
              `${result.purchase?.message || 'Please contact support with this reference.'}`
          );
        } catch {
          /* ignore */
        }
      }
      return res.json({ ok: true });
    }

    const result = await wallet.processTopUpWebhook(reference, amount);
    if (result.ok) {
      const shouldNotify =
        result.phone &&
        (!result.alreadyProcessed || !(await wallet.wasTopUpWhatsAppNotified(reference)));
      if (shouldNotify) {
        try {
          await wallet.notifyWalletTopUpSuccess({
            phone: result.phone,
            payerPhone: result.payerPhone,
            amount,
            balance: result.balance,
            reference,
            isGift: result.isGift,
          });
        } catch (err) {
          logger.warn('OPay top-up notify failed', { error: err.message });
        }
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error('OPay webhook error', { message: err.message });
    return res.status(500).json({ ok: false });
  }
}

function opayCallback(req, res) {
  const reference = req.query.reference || '';
  res.send(
    `<html><body style="font-family:sans-serif;text-align:center;padding:40px">` +
      `<h2>✅ Payment received</h2>` +
      `<p>Reference: ${reference || '—'}</p>` +
      `<p>Return to WhatsApp — your order or wallet will update shortly.</p>` +
      `</body></html>`
  );
}

module.exports = { handleOpayWebhook, opayCallback };
