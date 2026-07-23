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
const { renderPaymentResultPage } = require('./paymentResultPage');

function verifySignature(rawBody, signature) {
  const secret = config.payments.paystack.secretKey;
  if (!secret || !signature) return false;
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  return hash === signature;
}

async function getTransactionType(reference) {
  const db = getSupabase();
  if (!db) return null;
  const { data: tx } = await db
    .from('transactions')
    .select('metadata, type, provider')
    .eq('reference', reference)
    .maybeSingle();
  return tx?.metadata?.type || tx?.type || null;
}

async function fulfillVerifiedPaystackPayment(reference, amount) {
  const txType = await getTransactionType(reference);
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
    return { ok: !!result.ok, kind: 'guest', result };
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
  return { ok: !!result.ok, kind: 'topup', result };
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

    await fulfillVerifiedPaystackPayment(reference, amount);
    return res.json({ ok: true });
  }

  res.json({ ok: true, received: event.event });
}

/**
 * Browser return URL after Paystack — also fulfills so users don't wait for webhook.
 */
async function paystackCallback(req, res) {
  const reference = String(req.query.reference || '').trim();
  let statusLine = 'Return to WhatsApp — we are confirming your payment.';
  let ok = false;

  try {
    if (reference) {
      const verify = await paystack.verifyPayment(reference);
      if (verify.ok) {
        const fulfilled = await fulfillVerifiedPaystackPayment(reference, verify.amount);
        ok = fulfilled.ok;
        statusLine = ok
          ? 'Payment confirmed. Check WhatsApp — your airtime / wallet update should already be there.'
          : 'Payment received. If WhatsApp is quiet, send *paid* in the chat and we will finish it.';
      } else {
        statusLine = 'Payment is still processing. Return to WhatsApp in a moment, or send *paid*.';
      }
    }
  } catch (err) {
    logger.error('Paystack callback fulfill failed', { reference, message: err.message });
    statusLine = 'Payment received. Return to WhatsApp and send *paid* if nothing arrives.';
  }

  const waNumber = (
    process.env.ADMIN_WHATSAPP_NUMBER ||
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
    ''
  ).replace(/\D/g, '');
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent('paid')}`
    : '#';

  res.type('html').send(
    renderPaymentResultPage({
      ok,
      statusLine,
      reference,
      waHref: waNumber ? waHref : '',
      provider: 'Paystack',
    })
  );
}

module.exports = {
  handlePaystackWebhook,
  paystackCallback,
  verifySignature,
  fulfillVerifiedPaystackPayment,
};
