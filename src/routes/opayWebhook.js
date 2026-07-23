/**
 * OPay webhook — wallet top-up and guest purchases.
 */

const opay = require('../providers/opay');
const wallet = require('../wallet/walletService');
const guestPurchase = require('../wallet/guestPurchase');
const { getSupabase } = require('../db/supabase');
const logger = require('../core/logger');
const { renderPaymentResultPage } = require('./paymentResultPage');

async function getTransaction(reference) {
  const db = getSupabase();
  if (!db) return null;
  const { data: tx } = await db.from('transactions').select('*').eq('reference', reference).maybeSingle();
  return tx;
}

async function fulfillVerifiedOpayPayment(reference, amount) {
  const tx = await getTransaction(reference);
  const txType = tx?.metadata?.type || tx?.type;

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
        logger.warn('OPay top-up notify failed', { error: err.message });
      }
    }
  }
  return { ok: !!result.ok, kind: 'topup', result };
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
    await fulfillVerifiedOpayPayment(reference, amount);
    return res.json({ ok: true });
  } catch (err) {
    logger.error('OPay webhook error', { message: err.message });
    return res.status(500).json({ ok: false });
  }
}

async function opayCallback(req, res) {
  const reference = String(req.query.reference || req.body?.reference || '').trim();
  let statusLine = 'Return to WhatsApp — we are confirming your payment.';
  let ok = false;

  try {
    if (reference) {
      const verify = await opay.verifyPayment(reference);
      if (verify.ok) {
        const fulfilled = await fulfillVerifiedOpayPayment(reference, Number(verify.amount || 0));
        ok = fulfilled.ok;
        statusLine = ok
          ? 'Payment confirmed. Check WhatsApp — your airtime / wallet update should already be there.'
          : 'Payment received. If WhatsApp is quiet, send *paid* in the chat and we will finish it.';
      } else {
        statusLine = 'Payment is still processing. Return to WhatsApp in a moment, or send *paid*.';
      }
    }
  } catch (err) {
    logger.error('OPay callback fulfill failed', { reference, message: err.message });
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
      provider: 'OPay',
    })
  );
}

module.exports = { handleOpayWebhook, opayCallback, fulfillVerifiedOpayPayment };
