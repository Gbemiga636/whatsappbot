/**
 * Paystack webhook — wallet top-up and guest purchases.
 */

const crypto = require('crypto');
const config = require('../config');
const paystack = require('../providers/paystack');
const wallet = require('../wallet/walletService');
const guestPurchase = require('../wallet/guestPurchase');
const { getSupabase } = require('../db/supabase');
const logger = require('../core/logger');

function verifySignature(rawBody, signature) {
  const secret = config.payments.paystack.secretKey;
  if (!secret || !signature) return false;
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  return hash === signature;
}

async function getTransactionType(reference) {
  const db = getSupabase();
  if (!db) return null;
  const { data: tx } = await db.from('transactions').select('metadata, type').eq('reference', reference).maybeSingle();
  return tx?.metadata?.type || tx?.type || null;
}

async function handlePaystackWebhook(req, res) {
  const signature = req.headers['x-paystack-signature'];
  const rawBody = req.rawBody || JSON.stringify(req.body);

  if (!verifySignature(rawBody, signature)) {
    logger.warn('Paystack webhook — invalid signature');
    return res.status(401).json({ ok: false });
  }

  const event = req.body;
  logger.info('Paystack webhook', { event: event.event });

  if (event.event === 'charge.success') {
    const data = event.data;
    const reference = data.reference;
    const amount = (data.amount || 0) / 100;

    const verify = await paystack.verifyPayment(reference);
    if (!verify.ok) {
      return res.status(400).json({ ok: false, message: 'Verification failed' });
    }

    const txType = (await getTransactionType(reference)) || data.metadata?.type;
    const isGuest = txType === 'guest_purchase';

    if (isGuest) {
      const result = await guestPurchase.processGuestPurchaseWebhook(reference, amount);
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
            logger.warn('Guest purchase WhatsApp notify failed', { error: err.message });
          }
        }
      } else if (!result.ok && result.needsRefund) {
        logger.error('Guest purchase fulfillment failed after payment', {
          reference,
          phone: result.phone,
          reason: result.purchase?.message,
        });
        try {
          const whatsapp = require('../whatsapp');
          await whatsapp.sendText(
            result.phone,
            `⚠️ *Payment received but order failed*\n\n` +
              `Ref: *${reference}*\n` +
              `${result.purchase?.message || 'Please contact support with this reference.'}\n\n` +
              `_Our team will assist with a refund if needed._`
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
          logger.warn('Could not notify user of top-up', { error: err.message });
        }
      }
    }

    return res.json({ ok: true });
  }

  res.json({ ok: true, received: event.event });
}

function paystackCallback(req, res) {
  const reference = req.query.reference;
  res.send(
    `<html><body style="font-family:sans-serif;text-align:center;padding:40px">` +
      `<h2>✅ Payment received</h2>` +
      `<p>Reference: ${reference || '—'}</p>` +
      `<p>Return to WhatsApp — your order or wallet will update shortly.</p>` +
      `</body></html>`
  );
}

module.exports = { handlePaystackWebhook, paystackCallback, verifySignature };
