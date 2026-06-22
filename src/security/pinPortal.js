/**
 * Secure PIN portal — set & authorize via external HTTPS page (never in chat).
 */

const whatsapp = require('../whatsapp');
const config = require('../config');
const { createPinToken } = require('./pinToken');
const { getSession, setSession } = require('../sessionStore');
const transactionPin = require('./transactionPin');
const logger = require('../core/logger');

function portalBaseUrl() {
  return (config.publicBaseUrl || '').replace(/\/$/, '');
}

function buildPortalUrl(purpose, token) {
  const paths = { set: '/pin/set', verify: '/pin/verify', change: '/pin/change' };
  const path = paths[purpose] || paths.set;
  return `${portalBaseUrl()}${path}?token=${encodeURIComponent(token)}`;
}

async function storePending(phone, pendingPurchase) {
  if (!pendingPurchase) return;
  const session = getSession(phone) || { step: 'idle', data: {} };
  setSession(phone, {
    ...session,
    step: 'pin_web_pending',
    data: { ...session.data, pendingPurchase },
  });
}

async function sendPortalLink(phone, { purpose, pendingPurchase, cta, message }) {
  const base = portalBaseUrl();
  if (!base) {
    await whatsapp.sendText(
      phone,
      '⚠️ *PIN portal unavailable*\n\nServer needs `PUBLIC_BASE_URL` in `.env` (your Cloudflare tunnel URL).\n\nExample:\n`PUBLIC_BASE_URL=https://your-tunnel.trycloudflare.com`\n\nThen run `npm run tunnel` in a separate terminal.'
    );
    return false;
  }

  await storePending(phone, pendingPurchase);
  const { token } = createPinToken(phone, purpose);
  const url = buildPortalUrl(purpose, token);

  await whatsapp.sendText(
    phone,
    `${message}\n\n` +
      `🔗 *Secure link (tap to open):*\n${url}\n\n` +
      `_If the button below does not work, use the link above._`
  );

  try {
    await whatsapp.sendCtaUrl(
      phone,
      '_Opens a secure Mysogi page in your browser. Your PIN is never saved in this chat._',
      cta,
      url
    );
    logger.info('PIN portal link sent', { phone, purpose, url: `${base}/pin/${purpose === 'change' ? 'change' : purpose}` });
    return true;
  } catch (err) {
    const metaErr = err.response?.data?.error;
    logger.error('PIN portal CTA button failed — text link sent as fallback', {
      phone,
      purpose,
      error: metaErr?.message || err.message,
      code: metaErr?.code,
    });
    await whatsapp.sendText(
      phone,
      '⚠️ Could not show the PIN button in WhatsApp. *Use the secure link in the message above* to set or confirm your PIN.'
    );
    return true;
  }
}

async function promptSetPin(phone, { pendingPurchase } = {}) {
  const note = pendingPurchase
    ? 'Set your PIN *once* — you will reuse the same PIN for future purchases.'
    : 'Set once — you will reuse the same PIN for all wallet purchases.';

  return sendPortalLink(phone, {
    purpose: 'set',
    pendingPurchase,
    cta: 'Set PIN',
    message:
      `🔐 *Set transaction PIN (one time)*\n\n${note}\n\nTap below to open the *secure PIN page*.`,
  });
}

async function promptVerifyPin(phone, pendingPurchase) {
  const wallet = require('../wallet/walletService');
  const summary = pendingPurchase?.summaryText || 'Authorize this payment';
  const amount = pendingPurchase?.baseAmount
    ? `\nAmount: *${wallet.formatNaira(pendingPurchase.baseAmount)}*`
    : '';

  return sendPortalLink(phone, {
    purpose: 'verify',
    pendingPurchase,
    cta: 'Authorize',
    message:
      `🔐 *Confirm with your PIN*\n\n${summary}${amount}\n\n` +
      `Enter your *existing* transaction PIN on the secure page (not a new one).`,
  });
}

async function promptChangePin(phone) {
  if (!transactionPin.isPinSet(phone)) {
    return promptSetPin(phone, {});
  }

  return sendPortalLink(phone, {
    purpose: 'change',
    cta: 'Change PIN',
    message:
      '🔐 *Change transaction PIN*\n\nTap below to update your PIN on our secure page.',
  });
}

module.exports = {
  promptSetPin,
  promptVerifyPin,
  promptChangePin,
  buildPortalUrl,
  portalBaseUrl,
};
