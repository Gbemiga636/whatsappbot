/**
 * PIN gate — purchases authorize via secure web portal only.
 */

const transactionPin = require('./transactionPin');
const pinPortal = require('./pinPortal');

function isPinRequired() {
  const config = require('../config');
  return config.security?.pinRequired !== false;
}

async function guardPurchase(phone, pending) {
  if (!isPinRequired()) {
    const { executePendingPurchase } = require('../wallet/purchaseHelper');
    return executePendingPurchase(phone, pending);
  }

  if (!transactionPin.isPinSet(phone)) {
    await pinPortal.promptSetPin(phone, { pendingPurchase: pending });
    return { awaitingPinSetup: true };
  }

  if (transactionPin.isLocked(phone)) {
    const whatsapp = require('../whatsapp');
    await whatsapp.sendText(
      phone,
      `🔒 PIN locked. Try again in ${transactionPin.lockoutRemainingMinutes(phone)} minute(s).`
    );
    return { locked: true };
  }

  await pinPortal.promptVerifyPin(phone, pending);
  return { awaitingPin: true };
}

async function resumePendingPurchase(phone, pending) {
  if (!pending) return;
  const { executePendingPurchase } = require('../wallet/purchaseHelper');
  const { setSession, getSession } = require('../sessionStore');
  const session = getSession(phone) || {};
  const purchase = await executePendingPurchase(phone, pending);
  await sendPurchaseResult(phone, pending, purchase);

  setSession(phone, {
    step: 'super_menu',
    activeService: null,
    data: {
      ...(session.data?.nlHistory ? { nlHistory: session.data.nlHistory } : {}),
    },
  });
  return purchase;
}

async function sendPurchaseResult(phone, pending, purchase) {
  const whatsapp = require('../whatsapp');
  const wallet = require('../wallet/walletService');
  const { getSession } = require('../sessionStore');
  const session = getSession(phone) || {};

  if (purchase?.awaitingPin || purchase?.awaitingPinSetup || purchase?.locked) return;
  if (purchase?.paymentMethod === 'credit') return;

  if (!purchase?.ok) {
    if (!purchase?.offeredCredit && !purchase?.prompted) {
      const refundNote = purchase?.refunded ? '\n\n_Your wallet was refunded._' : '';
      await whatsapp.sendText(phone, `❌ ${purchase?.message || 'Payment failed'}${refundNote}`);
    }
    return;
  }

  if (pending.service === 'airtime') {
    const airtime = session.data?.airtime;
    const label = airtime?.type || pending.summaryText || 'Purchase';
    const providerNote = purchase.result?.pendingWebhook
      ? '\n_Airtime is being delivered — you will receive it shortly._'
      : '';
    await whatsapp.sendText(
      phone,
      `✅ *${label} complete!*\n\n` +
        `${purchase.result?.message ? `${purchase.result.message}\n\n` : ''}` +
        `Ref: *${purchase.reference}*\n` +
        `Paid: ${wallet.formatNaira(purchase.total || purchase.amount)}\n` +
        (purchase.balance != null ? `Balance: ${wallet.formatNaira(purchase.balance)}` : '') +
        providerNote
    );
  } else if (pending.service === 'bills') {
    const token = purchase.result?.token || purchase.result?.message || '';
    await whatsapp.sendText(
      phone,
      `✅ *Bill paid!*\n\nRef: *${purchase.reference}*\n${token ? `Token: ${token}\n` : ''}` +
        `Paid: ${wallet.formatNaira(purchase.total)}\n` +
        (purchase.balance != null ? `Balance: ${wallet.formatNaira(purchase.balance)}` : '')
    );
  } else if (pending.service === 'partners') {
    const service = session.data?.partnerService;
    await whatsapp.sendText(
      phone,
      `✅ *${service?.name || 'Order'}* booked!\n\nRef: *${purchase.reference}*\n` +
        `Paid: ${wallet.formatNaira(purchase.total)}`
    );
  }
}

module.exports = {
  isPinRequired,
  guardPurchase,
  resumePendingPurchase,
};
