/**
 * Secure PIN portal — set & authorize via external HTTPS page (never in chat).
 */

const whatsapp = require('../whatsapp');
const config = require('../config');
const { createPinToken } = require('./pinToken');
const { getSession, setSessionAndWait } = require('../sessionStore');
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
  await setSessionAndWait(phone, {
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
      '⚠️ PIN page unavailable right now. Try again in a moment.'
    );
    return false;
  }

  await storePending(phone, pendingPurchase);
  const { token } = createPinToken(phone, purpose, pendingPurchase);
  const url = buildPortalUrl(purpose, token);

  try {
    await whatsapp.sendCtaUrl(
      phone,
      `${message}`,
      cta,
      url
    );
    logger.info('PIN portal link sent', { phone, purpose, url: `${base}/pin/${purpose === 'change' ? 'change' : purpose}` });
    return true;
  } catch (err) {
    const metaErr = err.response?.data?.error;
    logger.error('PIN portal CTA button failed — sending text link fallback', {
      phone,
      purpose,
      error: metaErr?.message || err.message,
      code: metaErr?.code,
    });
    await whatsapp.sendText(phone, `${message}\n\n🔗 ${url}`);
    return true;
  }
}

async function promptSetPin(phone, { pendingPurchase } = {}) {
  return sendPortalLink(phone, {
    purpose: 'set',
    pendingPurchase,
    cta: 'Set PIN',
    message: pendingPurchase
      ? `🔐 *Set your PIN*\n\nThen we’ll finish your payment.`
      : `🔐 *Set your PIN*\n\nYou’ll use this same PIN for wallet payments.`,
  });
}

async function promptVerifyPin(phone, pendingPurchase) {
  const wallet = require('../wallet/walletService');
  const summary = pendingPurchase?.summaryText || 'this payment';
  const amount = pendingPurchase?.baseAmount
    ? ` · *${wallet.formatNaira(pendingPurchase.baseAmount)}*`
    : '';

  return sendPortalLink(phone, {
    purpose: 'verify',
    pendingPurchase,
    cta: 'Enter PIN',
    message: `🔐 *Confirm*\n${summary}${amount}`,
  });
}

async function promptChangePin(phone) {
  await transactionPin.ensurePinLoaded(phone);
  if (!(await transactionPin.isPinSetAsync(phone))) {
    return promptSetPin(phone, {});
  }

  return sendPortalLink(phone, {
    purpose: 'change',
    cta: 'Change PIN',
    message: `🔐 *Change PIN*`,
  });
}

module.exports = {
  promptSetPin,
  promptVerifyPin,
  promptChangePin,
  buildPortalUrl,
  portalBaseUrl,
};
