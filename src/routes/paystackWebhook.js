/**
 * Paystack webhook — credit wallet on successful payment.
 */

const crypto = require('crypto');
const config = require('../config');
const paystack = require('../providers/paystack');
const wallet = require('../wallet/walletService');
const whatsapp = require('../whatsapp');
const logger = require('../core/logger');

function verifySignature(rawBody, signature) {
  const secret = config.payments.paystack.secretKey;
  if (!secret || !signature) return false;
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  return hash === signature;
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
    const phone = data.metadata?.phone;

    const verify = await paystack.verifyPayment(reference);
    if (!verify.ok) {
      return res.status(400).json({ ok: false, message: 'Verification failed' });
    }

    const result = await wallet.processTopUpWebhook(reference, amount);

    if (result.ok && !result.alreadyProcessed && result.phone) {
      const credit = require('../credit/creditService');
      const repay = await credit.autoRepayOnTopUp(result.phone);
      if (repay?.repaid > 0) {
        result.balance = repay.balance;
        result.creditRepaid = repay.repaid;
      }
    }

    if (result.ok && !result.alreadyProcessed) {
      try {
        if (result.isGift && result.payerPhone && result.payerPhone !== result.phone) {
          await whatsapp.sendText(
            result.payerPhone,
            `✅ *Gift sent!*\n\n` +
              `${wallet.formatNaira(amount)} sent to *${wallet.formatPhoneDisplay(result.phone)}*\n` +
              `Ref: *${reference}*`
          );
          await whatsapp.sendText(
            result.phone,
            `🎁 *You received wallet credit!*\n\n` +
              `+${wallet.formatNaira(amount)}\n` +
              `New balance: *${wallet.formatNaira(result.balance)}*\n\n` +
              `Someone topped up your Mysogi wallet.\nType *menu* to start using it.`
          );
        } else if (result.phone) {
          let msg =
            `✅ *Wallet topped up!*\n\n` +
            `+${wallet.formatNaira(amount)}\n` +
            `New balance: *${wallet.formatNaira(result.balance)}*`;
          if (result.creditRepaid) {
            msg += `\n\n💳 Credit repaid: ${wallet.formatNaira(result.creditRepaid)}`;
          }
          msg += `\n\nType *menu* to continue.`;
          await whatsapp.sendText(result.phone, msg);
        }
      } catch (err) {
        logger.warn('Could not notify user of top-up', { error: err.message });
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
      `<p>Return to WhatsApp — your Mysogi wallet will update shortly.</p>` +
      `</body></html>`
  );
}

module.exports = { handlePaystackWebhook, paystackCallback, verifySignature };
